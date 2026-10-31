/** 캐시 태그. 동기화 후 변경된 컬렉션의 태그만 무효화한다. */
export const CACHE_TAGS = {
  members: 'content:members',
  awards: 'content:awards',
  projects: 'content:projects',
  qna: 'content:qna',
  settings: 'content:settings',
} as const;

export type CollectionKey = keyof typeof CACHE_TAGS;

export const ALL_CACHE_TAGS = Object.values(CACHE_TAGS);

/**
 * 시간 기반 안전망(초). 동기화 시 on-demand 무효화가 기본이며,
 * 무효화 호출이 실패하더라도 이 시간이 지나면 DB 에서 다시 읽는다.
 */
export const CONTENT_REVALIDATE_SECONDS = 3600;
