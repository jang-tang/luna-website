'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { invalidateCollections } from '@/services/cache/invalidate';
import { syncFromEnv } from '@/services/notion/runner';
import { logger } from '@/lib/logger';

/** 관리 페이지의 수동 동기화. /admin 은 proxy 의 Basic 인증을 통과한 요청만 도달한다. */
export async function triggerSync(formData: FormData) {
  // 서버 액션은 POST 로 직접 호출될 수 있으므로 인증 헤더를 한 번 더 확인한다
  const auth = (await headers()).get('authorization');
  if (!process.env.ADMIN_PASSWORD || !auth?.startsWith('Basic ')) throw new Error('Unauthorized');
  const mode = formData.get('mode') === 'full' ? 'full' : 'auto';
  try {
    await syncFromEnv({ trigger: 'admin', mode, onInvalidate: invalidateCollections });
  } catch (err) {
    logger.error('admin.sync_failed', { err });
  }
  revalidatePath('/admin/sync');
}
