import { getSyncEnv } from '@/config/env';
import { assertSyncAuthorized, fail, ok } from '@/lib/api';
import { getDb } from '@/services/database/client';
import { getSyncOverview } from '@/services/database/sync-repository';

/** 동기화 상태 조회 (운영자/모니터링용, 인증 필요) */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const env = getSyncEnv();
    assertSyncAuthorized(request, [env.SYNC_SECRET]);
    return ok(await getSyncOverview(getDb()));
  } catch (err) {
    return fail(err);
  }
}
