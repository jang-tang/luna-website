'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { isAdminAuthorized } from '@/lib/admin-auth';
import { invalidateCollections } from '@/services/cache/invalidate';
import { syncFromEnv } from '@/services/notion/runner';
import { logger } from '@/lib/logger';

/** 관리 페이지의 수동 동기화. /admin 은 proxy 의 Basic 인증을 통과한 요청만 도달한다. */
export async function triggerSync(formData: FormData) {
  // 서버 액션은 /admin 이 아닌 경로로도 POST 될 수 있으므로 proxy 와 별개로 아이디·비밀번호를 직접 검증한다
  if (!isAdminAuthorized((await headers()).get('authorization'))) throw new Error('Unauthorized');
  const mode = formData.get('mode') === 'full' ? 'full' : 'auto';
  try {
    await syncFromEnv({ trigger: 'admin', mode, onInvalidate: invalidateCollections });
  } catch (err) {
    logger.error('admin.sync_failed', { err });
  }
  revalidatePath('/admin/sync');
}
