/**
 * 상주형 동기화 스케줄러 (Docker/서버 환경용 별도 프로세스).
 *   npm run scheduler
 *
 * SYNC_INTERVAL_MINUTES(기본 15) 마다 동기화를 실행하고, 변경이 있으면 앱(APP_URL)에 캐시 무효화를 요청한다.
 * - 웹 서버와 분리된 프로세스라 이미지 변환 등 무거운 작업이 사용자 요청 처리에 영향을 주지 않는다.
 * - 여러 인스턴스가 떠 있어도 DB 임대 잠금으로 한 번에 하나만 실행된다.
 * - 서버리스(Vercel) 환경에서는 이 프로세스 대신 vercel.json 의 Cron → /api/cron/sync 를 사용한다.
 */
import './lib/env';
import { getSyncEnv } from '../src/config/env';
import { closeDb } from '../src/services/database/client';
import { requestRemoteInvalidation, syncFromEnv } from '../src/services/notion/runner';
import { logger } from '../src/lib/logger';

let stopping = false;
let timer: NodeJS.Timeout | undefined;
let wake: (() => void) | undefined;

async function tick() {
  try {
    const result = await syncFromEnv({
      trigger: 'scheduler',
      onInvalidate: async (changed) => {
        if (!(await requestRemoteInvalidation(changed))) logger.warn('scheduler.invalidate_skipped', { changed });
      },
    });
    logger.info('scheduler.tick', { status: result.status, changed: result.changed, notionRequests: result.notionRequests, durationMs: result.durationMs, errors: result.errors.length });
  } catch (err) {
    // 실패해도 프로세스는 유지하고 다음 주기에 재시도한다
    logger.error('scheduler.tick_failed', { err });
  }
}

async function main() {
  const intervalMs = getSyncEnv().SYNC_INTERVAL_MINUTES * 60_000;
  logger.info('scheduler.started', { intervalMinutes: intervalMs / 60_000 });
  while (!stopping) {
    const started = Date.now();
    await tick();
    const wait = Math.max(5_000, intervalMs - (Date.now() - started));
    await new Promise<void>((resolve) => {
      wake = resolve;
      timer = setTimeout(resolve, wait);
    });
  }
  await closeDb();
  logger.info('scheduler.stopped');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    wake?.();
  });
}

main().catch((err) => {
  logger.error('scheduler.crashed', { err });
  process.exit(1);
});
