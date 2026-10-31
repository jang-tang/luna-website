import { z } from 'zod';
import { getSyncEnv } from '@/config/env';
import { assertSyncAuthorized, fail, ok } from '@/lib/api';
import { ValidationError } from '@/lib/errors';
import { invalidateCollections } from '@/services/cache/invalidate';
import { CACHE_TAGS, type CollectionKey } from '@/services/cache/tags';

/** CLI/스케줄러 등 Next.js 프로세스 밖에서 동기화한 뒤 캐시 무효화를 요청하는 내부 엔드포인트 */
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  collections: z.array(z.enum(Object.keys(CACHE_TAGS) as [CollectionKey, ...CollectionKey[]])).min(1).max(10),
});

export async function POST(request: Request) {
  try {
    const env = getSyncEnv();
    assertSyncAuthorized(request, [env.SYNC_SECRET]);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.issues.map((i) => i.message));
    invalidateCollections(parsed.data.collections);
    return ok({ collections: parsed.data.collections });
  } catch (err) {
    return fail(err);
  }
}
