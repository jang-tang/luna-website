import { getSyncEnv } from '@/config/env';
import { assertSyncAuthorized, fail, ok } from '@/lib/api';
import { invalidateCollections } from '@/services/cache/invalidate';
import { syncFromEnv } from '@/services/notion/runner';

/**
 * 정기 동기화 엔드포인트.
 * - Vercel Cron: GET + Authorization: Bearer $CRON_SECRET
 * - 기타 스케줄러/수동 실행: POST + Authorization: Bearer $SYNC_SECRET (?mode=full 로 전체 동기화)
 * 동일 시간대 중복 호출은 DB 임대 잠금으로 한 번만 실행된다(나머지는 status=skipped).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: Request) {
  try {
    const env = getSyncEnv();
    assertSyncAuthorized(request, [env.SYNC_SECRET, env.CRON_SECRET]);
    const mode = new URL(request.url).searchParams.get('mode') === 'full' ? 'full' : 'auto';
    const result = await syncFromEnv({ trigger: request.method === 'GET' ? 'cron' : 'api', mode, onInvalidate: invalidateCollections });
    return ok(result, result.status === 'failed' ? 500 : 200);
  } catch (err) {
    return fail(err);
  }
}

export const GET = handle;
export const POST = handle;
