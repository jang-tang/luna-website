import { getNotionEnv, getSyncEnv } from '@/config/env';
import type { CollectionKey } from '@/services/cache/tags';
import { getDb } from '@/services/database/client';
import { NotionClient } from './client';
import { COLLECTIONS } from './collections';
import { runSync, type SyncDeps, type SyncMode, type SyncResult } from './sync';

/** 환경변수로부터 동기화 의존성을 구성한다. (API 라우트 / 관리 페이지 / CLI / 스케줄러 공용) */
export function createSyncDeps(onInvalidate?: SyncDeps['onInvalidate']): SyncDeps {
  const notionEnv = getNotionEnv();
  const syncEnv = getSyncEnv();
  const dataSourceIds = Object.fromEntries(
    Object.values(COLLECTIONS).map((def) => [def.key, notionEnv[def.envKey]]),
  ) as Partial<Record<CollectionKey, string>>;
  return {
    db: getDb(),
    notion: new NotionClient({ token: notionEnv.NOTION_TOKEN, requestsPerSecond: notionEnv.NOTION_REQUESTS_PER_SECOND }),
    dataSourceIds,
    lockTtlMs: syncEnv.SYNC_LOCK_TTL_MINUTES * 60_000,
    onInvalidate,
  };
}

export function configuredCollections(deps: SyncDeps): CollectionKey[] {
  return (Object.keys(deps.dataSourceIds) as CollectionKey[]).filter((k) => deps.dataSourceIds[k]);
}

export async function syncFromEnv(options: { trigger: string; mode?: SyncMode; onInvalidate?: SyncDeps['onInvalidate'] }): Promise<SyncResult> {
  const deps = createSyncDeps(options.onInvalidate);
  return runSync(deps, { trigger: options.trigger, mode: options.mode });
}

/**
 * Next.js 서버 밖(CLI/스케줄러)에서 동기화한 경우, 실행 중인 앱에 캐시 무효화를 요청한다.
 * APP_URL 이 없으면 시간 기반 재검증(최대 1시간)으로 반영된다.
 */
export async function requestRemoteInvalidation(changed: CollectionKey[]): Promise<boolean> {
  const { APP_URL, SYNC_SECRET } = getSyncEnv();
  if (!APP_URL || !SYNC_SECRET || changed.length === 0) return false;
  const res = await fetch(new URL('/api/revalidate', APP_URL), {
    method: 'POST',
    headers: { Authorization: `Bearer ${SYNC_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ collections: changed }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`revalidate request failed (${res.status})`);
  return true;
}
