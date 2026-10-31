/**
 * Notion → DB 동기화 (수동/CLI).
 *   npm run sync              # 증분 (커서가 없으면 전체)
 *   npm run sync -- --full    # 전체 동기화
 * 실행 중인 앱이 있으면(APP_URL + SYNC_SECRET) 변경된 컬렉션의 캐시 무효화를 요청한다.
 */
import './lib/env';
import { closeDb } from '../src/services/database/client';
import { requestRemoteInvalidation, syncFromEnv } from '../src/services/notion/runner';
import { logger } from '../src/lib/logger';

async function main() {
  const mode = process.argv.includes('--full') ? 'full' : 'auto';
  const result = await syncFromEnv({
    trigger: 'cli',
    mode,
    onInvalidate: async (changed) => {
      const sent = await requestRemoteInvalidation(changed);
      if (!sent) logger.warn('sync.invalidate_skipped', { reason: 'APP_URL/SYNC_SECRET not set — pages refresh within 1 hour', changed });
    },
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'failed') process.exitCode = 1;
}

main()
  .catch((err) => {
    logger.error('sync.failed', { err });
    process.exitCode = 1;
  })
  .finally(() => closeDb());
