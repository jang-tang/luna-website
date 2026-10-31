import { createHash, randomUUID } from 'node:crypto';
import { and, inArray, ne, notExists, sql } from 'drizzle-orm';
import { errorMessage } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { CollectionKey } from '@/services/cache/tags';
import type { Database } from '@/services/database/client';
import { awards, media, memberGroups, members, projects, syncState, type CollectionStats, type SyncRunError, type SyncRunStatus } from '@/services/database/schema';
import * as repo from '@/services/database/sync-repository';
import type { NotionClient } from './client';
import { COLLECTION_ORDER, COLLECTIONS, PROPS, type CollectionDef } from './collections';
import { downloadImage, ImageError, processImage } from './images';
import { PropertyError, truncatedTextProperties } from './properties';
import type { NotionPage, RichText } from './types';

/**
 * Notion → DB 동기화 엔진
 *
 *   Fetcher(Notion 조회) → Transformer(속성 변환) → Validator(zod) → 이미지 처리 → DB Upsert(트랜잭션) → 캐시 무효화
 *
 * - 초기/전체 동기화: 데이터 소스 전체 조회
 * - 증분 동기화: last_edited_time >= 커서 인 페이지만 조회 (Notion 의 last_edited_time 은 분 단위로 절삭되므로 커서에 여유를 둔다)
 * - 삭제 감지: 매 실행마다 '제목 속성만' 가볍게 전체 목록을 받아 DB 와 비교 → 사라진 페이지는 soft delete
 *   (휴지통 이동/영구 삭제/통합 공유 해제 모두 '목록에서 사라짐' 으로 같게 처리된다)
 * - 비활성: Notion '공개' 체크 해제 → status=hidden (데이터는 유지, 화면에서만 숨김)
 * - 컬렉션 단위 트랜잭션: 한 컬렉션의 변경은 전부 반영되거나 전혀 반영되지 않는다. 실패한 컬렉션은 커서를 유지해 다음 실행에서 재시도한다.
 * - 변경 없는 페이지는 content_hash 비교로 쓰기를 건너뛰고, 이미지가 같으면 다시 받지 않는다.
 */

export type SyncMode = 'auto' | 'full';

export type SyncDeps = {
  db: Database;
  notion: NotionClient;
  dataSourceIds: Partial<Record<CollectionKey, string>>;
  fetchImpl?: typeof fetch;
  /** 이미지 호스트 DNS 조회 (테스트에서 대체) */
  lookupImpl?: Parameters<typeof downloadImage>[2];
  lockTtlMs?: number;
  /** auto 모드에서 이 시간 이상 전체 동기화가 없었으면 전체 동기화로 전환 (안전망) */
  fullSyncIntervalMs?: number;
  onInvalidate?: (changed: CollectionKey[]) => Promise<void> | void;
};

export type SyncResult = {
  runId: number | null;
  status: SyncRunStatus;
  stats: Partial<Record<CollectionKey, CollectionStats>>;
  errors: SyncRunError[];
  changed: CollectionKey[];
  notionRequests: number;
  durationMs: number;
};

const LOCK_NAME = 'notion-sync';
/** 커서 여유: 분 단위 절삭 + 서버 간 시계 오차 대비 */
const CURSOR_SAFETY_MS = 2 * 60_000;
const UPSERT_CHUNK = 100;
const MAX_RESTORE_FETCHES = 300;

const emptyStats = (mode: CollectionStats['mode']): CollectionStats => ({
  mode,
  fetched: 0,
  added: 0,
  updated: 0,
  unchanged: 0,
  deleted: 0,
  hidden: 0,
  restored: 0,
  failed: 0,
  durationMs: 0,
});

export const floorToMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

export async function runSync(deps: SyncDeps, options: { trigger: string; mode?: SyncMode; only?: CollectionKey[] }): Promise<SyncResult> {
  const started = Date.now();
  const { db } = deps;
  const lockTtlMs = deps.lockTtlMs ?? 15 * 60_000;
  const owner = randomUUID();
  const requestsBefore = deps.notion.requestCount;

  await repo.markStaleRuns(db, lockTtlMs * 2);

  if (!(await repo.acquireLock(db, LOCK_NAME, owner, lockTtlMs))) {
    logger.info('sync.skipped', { reason: 'another sync is running', trigger: options.trigger });
    await repo.recordSkippedRun(db, options.trigger, 'another sync is running');
    return { runId: null, status: 'skipped', stats: {}, errors: [], changed: [], notionRequests: 0, durationMs: Date.now() - started };
  }

  const mode = options.mode ?? 'auto';
  const runId = await repo.startRun(db, options.trigger, mode);
  const stats: SyncResult['stats'] = {};
  const errors: SyncRunError[] = [];
  const changed: CollectionKey[] = [];
  let failedCollections = 0;
  let attempted = 0;

  try {
    for (const key of COLLECTION_ORDER) {
      if (options.only && !options.only.includes(key)) continue;
      const dataSourceId = deps.dataSourceIds[key];
      if (!dataSourceId) continue; // 아직 연결하지 않은 컬렉션은 건너뛴다 (기존 DB 데이터 유지)
      attempted++;
      const def = COLLECTIONS[key] as CollectionDef;
      try {
        const result = await syncCollection(deps, def, dataSourceId, mode, errors);
        stats[key] = result;
        if (result.added + result.updated + result.deleted + result.hidden + result.restored > 0) changed.push(key);
        logger.info('sync.collection', { collection: key, ...result });
      } catch (err) {
        failedCollections++;
        const message = errorMessage(err);
        errors.push({ collection: key, message });
        logger.error('sync.collection_failed', { collection: key, err });
        await repo.recordCollectionError(db, key, message).catch(() => {});
      }
      if (!(await repo.renewLock(db, LOCK_NAME, owner, lockTtlMs))) {
        errors.push({ message: 'lock lost during sync' });
        break;
      }
    }

    await cleanupOrphanMedia(db).catch((err) => logger.warn('sync.media_cleanup_failed', { err }));

    const status: SyncRunStatus =
      attempted > 0 && failedCollections === attempted ? 'failed' : failedCollections > 0 || errors.length > 0 ? 'partial' : 'success';
    await repo.finishRun(db, runId, { status, stats: stats as Record<string, CollectionStats>, errors });

    if (changed.length > 0 && deps.onInvalidate) {
      try {
        await deps.onInvalidate(changed);
      } catch (err) {
        logger.warn('sync.invalidate_failed', { err });
      }
    }
    return { runId, status, stats, errors, changed, notionRequests: deps.notion.requestCount - requestsBefore, durationMs: Date.now() - started };
  } catch (err) {
    errors.push({ message: errorMessage(err) });
    await repo.finishRun(db, runId, { status: 'failed', stats: stats as Record<string, CollectionStats>, errors }).catch(() => {});
    throw err;
  } finally {
    await repo.releaseLock(db, LOCK_NAME, owner).catch((err) => logger.warn('sync.lock_release_failed', { err }));
  }
}

type ExistingRow = {
  notionPageId: string;
  status: 'published' | 'hidden' | 'deleted';
  contentHash: string | null;
  imageId?: string | null;
  imageSourceKey?: string | null;
};

async function syncCollection(deps: SyncDeps, def: CollectionDef, dataSourceId: string, requestedMode: SyncMode, runErrors: SyncRunError[]): Promise<CollectionStats> {
  const { db, notion } = deps;
  const startedAt = new Date();
  const state = await repo.getSyncState(db, def.key);
  const fullDue =
    !state?.lastFullSyncAt || Date.now() - state.lastFullSyncAt.getTime() > (deps.fullSyncIntervalMs ?? 24 * 60 * 60_000);
  const full = requestedMode === 'full' || !state?.cursor || fullDue;
  const stats = emptyStats(full ? 'full' : 'incremental');

  // 1) Fetch: 변경된 페이지 (전체 모드면 모든 페이지)
  const filter = full ? undefined : { timestamp: 'last_edited_time', last_edited_time: { on_or_after: state!.cursor!.toISOString() } };
  const changedResult = await notion.queryAll(dataSourceId, { filter });
  const pages = new Map(changedResult.pages.map((p) => [p.id, p]));

  // 2) 삭제 감지용 전체 목록 (제목 속성만 받아 응답을 최소화)
  const listing = full ? changedResult : await notion.queryAll(dataSourceId, { filterProperties: ['title'] });
  const liveIds = new Set(listing.pages.filter((p) => !p.in_trash).map((p) => p.id));

  // 3) DB 현재 상태
  const table = def.table;
  const existingRows: ExistingRow[] = await db
    .select({
      notionPageId: table.notionPageId,
      status: table.status,
      contentHash: table.contentHash,
      ...(def.imageVariant ? { imageId: table.imageId, imageSourceKey: table.imageSourceKey } : {}),
    })
    .from(table);
  const existing = new Map(existingRows.map((r) => [r.notionPageId, r]));

  // Notion 에는 살아있는데 DB 에 없거나 삭제 처리된 페이지 → 개별 조회해 복구 (증분 조회 누락 대비)
  const missing = [...liveIds].filter((id) => !pages.has(id) && (!existing.has(id) || existing.get(id)!.status === 'deleted'));
  for (const id of missing.slice(0, MAX_RESTORE_FETCHES)) {
    pages.set(id, await notion.retrievePage(id));
  }
  stats.fetched = pages.size;

  // 4) Transform + Validate + 이미지
  const upserts: Record<string, unknown>[] = [];
  const holdCursorAt: Date[] = [];
  for (const page of pages.values()) {
    if (page.in_trash || page.is_archived) continue; // 아래 삭제 단계에서 처리
    const prev = existing.get(page.id);
    let transformed;
    try {
      await hydrateTruncatedText(notion, page);
      const t = def.transform(page);
      const record = def.schema.parse(t.record) as Record<string, unknown>;
      transformed = { ...t, record };
    } catch (err) {
      // 콘텐츠 오류(필수 값 누락 등): 해당 페이지만 건너뛰고 기존 DB 값은 유지. 수정되면 last_edited_time 이 바뀌어 다시 처리된다.
      stats.failed++;
      const message = err instanceof PropertyError ? err.message : formatValidationError(err);
      runErrors.push({ collection: def.key, pageId: page.id, message });
      continue;
    }

    const status = transformed.published ? 'published' : 'hidden';
    const contentHash = hashOf({ r: transformed.record, o: transformed.sortOrder, s: status, i: transformed.image?.sourceKey ?? null });
    if (prev && prev.status !== 'deleted' && prev.contentHash === contentHash) {
      stats.unchanged++;
      continue;
    }

    let imageId: string | null = null;
    let imageSourceKey: string | null = null;
    let storedHash: string | null = contentHash;
    if (def.imageVariant && transformed.image) {
      if (prev?.imageSourceKey === transformed.image.sourceKey && prev.imageId) {
        imageId = prev.imageId;
        imageSourceKey = prev.imageSourceKey;
      } else {
        try {
          imageId = await storeImage(db, transformed.image.url, transformed.image.sourceKey, def, deps.fetchImpl, deps.lookupImpl);
          imageSourceKey = transformed.image.sourceKey;
        } catch (err) {
          imageId = prev?.imageId ?? null;
          imageSourceKey = prev?.imageSourceKey ?? null;
          if (err instanceof ImageError && err.permanent) {
            // 영구 실패(형식 미지원 등): 같은 파일로는 계속 실패하므로 재시도하지 않는다.
            // 해시를 그대로 저장해 두면 다음 실행부터는 건너뛰고, 노션에서 사진을 바꿀 때(소스 키 변경)만 다시 처리된다.
          } else {
            // 일시적 실패(네트워크 등): 기존 이미지를 유지하고, 해시를 비워 다음 실행에서 재시도. 커서도 이 페이지 이전으로 묶어둔다.
            storedHash = null;
            holdCursorAt.push(new Date(page.last_edited_time));
          }
          runErrors.push({ collection: def.key, pageId: page.id, message: `image: ${errorMessage(err)}` });
        }
      }
    }

    if (!prev) stats.added++;
    else if (prev.status === 'deleted') stats.restored++;
    else if (status === 'hidden' && prev.status !== 'hidden') stats.hidden++;
    else stats.updated++;

    upserts.push({
      ...transformed.record,
      ...(def.imageVariant ? { imageId, imageSourceKey } : {}),
      notionPageId: page.id,
      sortOrder: transformed.sortOrder,
      status,
      notionLastEditedAt: new Date(page.last_edited_time),
      contentHash: storedHash,
      deletedAt: null,
      updatedAt: new Date(),
    });
  }

  // 5) 삭제 대상 계산 — 목록이 완전할 때만. Notion 쪽 행이 하나도 없는데 DB 에 Notion 행이 있으면 (권한 해제 등 의심) 대량 삭제하지 않는다.
  let toDelete: string[] = [];
  const notionRowsActive = existingRows.filter((r) => r.status !== 'deleted' && !r.notionPageId.startsWith('seed:')).length;
  if (!listing.complete) {
    runErrors.push({ collection: def.key, message: 'Notion 목록이 상한(10,000건)에 걸려 삭제 감지를 건너뜀' });
  } else if (liveIds.size === 0 && notionRowsActive > 0) {
    runErrors.push({ collection: def.key, message: 'Notion 에서 0건이 조회되어 대량 삭제를 보류함 (통합 공유 상태를 확인하세요)' });
  } else {
    toDelete = existingRows.filter((r) => r.status !== 'deleted' && !liveIds.has(r.notionPageId)).map((r) => r.notionPageId);
  }
  stats.deleted = toDelete.length;

  // 멤버 탭 순서: '기수' select 옵션 순서
  let groupOrder: string[] | null = null;
  if (def.key === 'members') {
    const ds = await notion.retrieveDataSource(dataSourceId);
    const prop = ds.properties[PROPS.members.group];
    groupOrder = prop?.select?.options.map((o) => o.name) ?? null;
  }

  // 6) 트랜잭션으로 반영 + 커서 갱신
  let cursor = new Date(floorToMinute(startedAt).getTime() - CURSOR_SAFETY_MS);
  for (const t of holdCursorAt) if (t < cursor) cursor = floorToMinute(t);

  await db.transaction(async (tx) => {
    for (let i = 0; i < upserts.length; i += UPSERT_CHUNK) {
      const chunk = upserts.slice(i, i + UPSERT_CHUNK);
      const set = Object.fromEntries(
        Object.keys(chunk[0]!)
          .filter((k) => k !== 'notionPageId')
          .map((k) => [k, sql.raw(`excluded."${table[k].name}"`)]),
      );
      await tx.insert(table).values(chunk).onConflictDoUpdate({ target: table.notionPageId, set });
    }
    if (toDelete.length > 0) {
      await tx
        .update(table)
        .set({ status: 'deleted', deletedAt: sql`now()`, contentHash: null, updatedAt: sql`now()` })
        .where(and(inArray(table.notionPageId, toDelete), ne(table.status, 'deleted')));
    }
    if (groupOrder) {
      await tx.delete(memberGroups);
      if (groupOrder.length > 0) await tx.insert(memberGroups).values(groupOrder.map((name, i) => ({ name, sortOrder: i })));
    }
    const statePatch = { cursor, lastSuccessAt: sql`now()`, lastError: null, updatedAt: sql`now()`, ...(full ? { lastFullSyncAt: sql`now()` } : {}) };
    await tx
      .insert(syncState)
      .values({ collection: def.key, ...statePatch })
      .onConflictDoUpdate({ target: syncState.collection, set: statePatch });
  });

  stats.durationMs = Date.now() - startedAt.getTime();
  return stats;
}

function hashOf(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function formatValidationError(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    return (err as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  return errorMessage(err);
}

/** 25조각 이상인 텍스트 속성은 잘렸을 수 있으므로 property item API 로 전체를 받아 채운다. */
async function hydrateTruncatedText(notion: NotionClient, page: NotionPage) {
  for (const { name, id } of truncatedTextProperties(page)) {
    const items = await notion.retrieveFullPropertyItems(page.id, id);
    const parts = items.map((i) => i.rich_text ?? i.title).filter((p): p is RichText => Boolean(p));
    const prop = page.properties[name]!;
    if (prop.type === 'title') (prop as { title: RichText[] }).title = parts;
    else (prop as { rich_text: RichText[] }).rich_text = parts;
  }
}

async function storeImage(db: Database, url: string, sourceKey: string, def: CollectionDef, fetchImpl?: typeof fetch, lookupImpl?: Parameters<typeof downloadImage>[2]): Promise<string> {
  const raw = await downloadImage(url, fetchImpl, lookupImpl);
  const image = await processImage(raw, def.imageVariant!);
  await db
    .insert(media)
    .values({ id: image.id, sourceKey, contentType: image.contentType, width: image.width, height: image.height, byteSize: image.data.length, data: image.data })
    .onConflictDoNothing();
  return image.id;
}

/** 어떤 행에서도 참조하지 않는 이미지를 정리한다. 캐시된 페이지가 참조 중일 수 있으므로 하루 유예. */
export async function cleanupOrphanMedia(db: Database): Promise<number> {
  const deleted = await db
    .delete(media)
    .where(
      and(
        sql`${media.createdAt} < now() - interval '1 day'`,
        notExists(db.select({ x: sql`1` }).from(members).where(sql`${members.imageId} = ${media.id}`)),
        notExists(db.select({ x: sql`1` }).from(awards).where(sql`${awards.imageId} = ${media.id}`)),
        notExists(db.select({ x: sql`1` }).from(projects).where(sql`${projects.imageId} = ${media.id}`)),
      ),
    )
    .returning({ id: media.id });
  return deleted.length;
}
