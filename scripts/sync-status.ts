/**
 * 동기화 상태 확인 (CLI).
 *   npm run sync:status
 */
import './lib/env';
import { closeDb, getDb } from '../src/services/database/client';
import { getSyncOverview } from '../src/services/database/sync-repository';

async function main() {
  const o = await getSyncOverview(getDb(), 10);
  const fmt = (d: Date | null | undefined) => (d ? d.toISOString() : '-');
  console.log(`마지막 성공: ${fmt(o.lastSuccessAt)}   잠금: ${o.locks.length ? `until ${fmt(o.locks[0]!.lockedUntil)}` : '없음'}`);
  console.table(o.states.map((s) => ({ collection: s.collection, cursor: fmt(s.cursor), lastSuccess: fmt(s.lastSuccessAt), lastFull: fmt(s.lastFullSyncAt), lastError: s.lastError ?? '' })));
  console.table(
    o.runs.map((r) => {
      const t = Object.values(r.stats).reduce((a, s) => ({ added: a.added + s.added, updated: a.updated + s.updated, deleted: a.deleted + s.deleted, hidden: a.hidden + s.hidden, failed: a.failed + s.failed }), { added: 0, updated: 0, deleted: 0, hidden: 0, failed: 0 });
      return { id: r.id, trigger: r.trigger, mode: r.mode, status: r.status, started: fmt(r.startedAt), finished: fmt(r.finishedAt), ...t, errors: r.errors.length };
    }),
  );
  for (const r of o.runs.filter((r) => r.errors.length > 0).slice(0, 3)) {
    console.log(`#${r.id} errors:`);
    for (const e of r.errors.slice(0, 10)) console.log(`  - ${[e.collection, e.pageId, e.message].filter(Boolean).join(' | ')}`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
