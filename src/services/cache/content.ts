import 'server-only';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { getDb } from '@/services/database/client';
import { selectAwardYears, selectMemberGroups, selectProjectYears, selectQnas, selectRecentProjectNames, selectSettingRows } from '@/services/database/queries';
import { buildHomeTagsFromProjects, buildSiteSettings, HOME_TAG_LINES, HOME_TAGS_PER_LINE } from '@/services/content/settings';
import { logger } from '@/lib/logger';
import { CACHE_TAGS, CONTENT_REVALIDATE_SECONDS } from './tags';

/**
 * 서버 데이터 캐시 계층.
 *  1) unstable_cache: 요청 간 공유되는 Data Cache (태그 단위 무효화, SWR)
 *  2) React cache: 한 번의 렌더링 안에서 중복 호출 제거
 * DB 오류는 그대로 throw 한다 → ISR 재생성이 실패하면 Next.js 가 마지막으로 성공한 페이지를 계속 제공한다.
 */

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    logger.debug('db.query', { label, ms: Math.round((performance.now() - started) * 10) / 10 });
  }
}

const cached = <T>(key: string, tag: string, fn: () => Promise<T>) =>
  cache(unstable_cache(() => timed(key, fn), ['luna', key], { tags: [tag], revalidate: CONTENT_REVALIDATE_SECONDS }));

export const getMemberGroups = cached('members', CACHE_TAGS.members, () => selectMemberGroups(getDb()));
export const getAwardYears = cached('awards', CACHE_TAGS.awards, () => selectAwardYears(getDb()));
export const getProjectYears = cached('projects', CACHE_TAGS.projects, () => selectProjectYears(getDb()));
export const getQnas = cached('qna', CACHE_TAGS.qna, () => selectQnas(getDb()));
export const getSiteSettings = cached('settings', CACHE_TAGS.settings, async () => buildSiteSettings(await selectSettingRows(getDb())));

/** 홈 화면용 설정: 흐르는 태그는 Projects DB 의 최신 프로젝트로 채운다 (프로젝트가 부족하면 사이트 설정값) */
const getRecentProjectTags = cached('home-tags', CACHE_TAGS.projects, async () =>
  buildHomeTagsFromProjects(await selectRecentProjectNames(getDb(), HOME_TAGS_PER_LINE * HOME_TAG_LINES)),
);

export async function getHomeSettings() {
  const [settings, projectTags] = await Promise.all([getSiteSettings(), getRecentProjectTags()]);
  return projectTags ? { ...settings, homeTags: projectTags } : settings;
}
