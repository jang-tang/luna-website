import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Database } from './client';
import { syncLocks, syncRuns, syncState, type CollectionStats, type SyncRunError, type SyncRunStatus } from './schema';

/** 동기화 메타데이터(잠금/상태/실행 이력) 접근 계층 */

export async function acquireLock(db: Database, name: string, owner: string, ttlMs: number): Promise<boolean> {
  const until = sql`now() + ${`${Math.ceil(ttlMs / 1000)} seconds`}::interval`;
  const rows = await db
    .insert(syncLocks)
    .values({ name, owner, lockedUntil: until, acquiredAt: sql`now()` })
    .onConflictDoUpdate({
      target: syncLocks.name,
      set: { owner, lockedUntil: until, acquiredAt: sql`now()` },
      // 기존 잠금이 만료된 경우에만 탈취 (프로세스가 죽어도 TTL 후 복구)
      setWhere: lt(syncLocks.lockedUntil, sql`now()`),
    })
    .returning({ owner: syncLocks.owner });
  return rows[0]?.owner === owner;
}

export async function renewLock(db: Database, name: string, owner: string, ttlMs: number): Promise<boolean> {
  const rows = await db
    .update(syncLocks)
    .set({ lockedUntil: sql`now() + ${`${Math.ceil(ttlMs / 1000)} seconds`}::interval` })
    .where(and(eq(syncLocks.name, name), eq(syncLocks.owner, owner)))
    .returning({ owner: syncLocks.owner });
  return rows.length === 1;
}

export async function releaseLock(db: Database, name: string, owner: string): Promise<void> {
  await db.delete(syncLocks).where(and(eq(syncLocks.name, name), eq(syncLocks.owner, owner)));
}

export async function getSyncState(db: Database, collection: string) {
  const rows = await db.select().from(syncState).where(eq(syncState.collection, collection));
  return rows[0] ?? null;
}

export async function recordCollectionError(db: Database, collection: string, message: string) {
  await db
    .insert(syncState)
    .values({ collection, lastError: message, updatedAt: sql`now()` })
    .onConflictDoUpdate({ target: syncState.collection, set: { lastError: message, updatedAt: sql`now()` } });
}

export async function startRun(db: Database, trigger: string, mode: string) {
  const rows = await db.insert(syncRuns).values({ trigger, mode, status: 'running' }).returning({ id: syncRuns.id });
  return rows[0]!.id;
}

export async function finishRun(
  db: Database,
  id: number,
  result: { status: SyncRunStatus; stats: Record<string, CollectionStats>; errors: SyncRunError[] },
) {
  await db
    .update(syncRuns)
    .set({ status: result.status, stats: result.stats, errors: result.errors.slice(0, 200), finishedAt: sql`now()` })
    .where(eq(syncRuns.id, id));
}

export async function recordSkippedRun(db: Database, trigger: string, reason: string) {
  await db.insert(syncRuns).values({
    trigger,
    mode: 'none',
    status: 'skipped',
    finishedAt: sql`now()`,
    errors: [{ message: reason }],
  });
}

/** 비정상 종료로 'running' 상태에 남은 오래된 실행 기록을 실패로 정리한다. */
export async function markStaleRuns(db: Database, olderThanMs: number) {
  await db
    .update(syncRuns)
    .set({ status: 'failed', finishedAt: sql`now()`, errors: [{ message: 'run did not finish (process terminated?)' }] })
    .where(and(eq(syncRuns.status, 'running'), lt(syncRuns.startedAt, sql`now() - ${`${Math.ceil(olderThanMs / 1000)} seconds`}::interval`)));
}

export async function getSyncOverview(db: Database, limit = 20) {
  const [runs, states, locks] = await Promise.all([
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit),
    db.select().from(syncState),
    db.select().from(syncLocks),
  ]);
  const lastSuccess = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(eq(syncRuns.status, 'success'))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  return { runs, states, locks, lastSuccessAt: lastSuccess[0]?.finishedAt ?? null };
}
