import 'server-only';
import { revalidateTag } from 'next/cache';
import { logger } from '@/lib/logger';
import { CACHE_TAGS, type CollectionKey } from './tags';

/**
 * 동기화로 변경된 컬렉션의 캐시를 무효화한다.
 * 'max' 프로필 = stale-while-revalidate: 다음 요청은 기존 페이지를 즉시 받고, 백그라운드에서 새 데이터로 재생성된다.
 */
export function invalidateCollections(keys: CollectionKey[]): void {
  const tags = [...new Set(keys.map((k) => CACHE_TAGS[k]))];
  for (const tag of tags) revalidateTag(tag, 'max');
  logger.info('cache.invalidated', { tags });
}
