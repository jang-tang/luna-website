import { logger } from '@/lib/logger';
import { pingDb } from './client';

/** 빌드 시점에 DB 접근 가능 여부 (불가하면 페이지를 첫 요청 시 렌더링하도록 미룬다) */
export async function canReachDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await pingDb();
    return true;
  } catch (err) {
    logger.warn('build.db_unreachable', { err });
    return false;
  }
}
