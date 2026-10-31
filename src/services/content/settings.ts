import type { SiteSettings } from './types';

/**
 * Notion '사이트 설정' 데이터베이스의 키 목록과 기본값.
 * 기본값은 원본 사이트에 하드코딩되어 있던 값이며, Notion 에 값이 없거나 형식이 잘못되면 기본값을 사용한다.
 */
export const SETTING_KEYS = {
  projectCount: 'stats.projects',
  contestCount: 'stats.contests',
  prizeTotal: 'stats.prize',
  homeTags1: 'home.tags.1',
  homeTags2: 'home.tags.2',
  homeTags3: 'home.tags.3',
  qnaVideoUrl: 'qna.video_url',
} as const;

export const DEFAULT_SETTINGS: SiteSettings = {
  projectCount: '72',
  contestCount: '114',
  prizeTotal: '7,500만원',
  homeTags: [
    ['하랑', '워커홀릭', '달그락', '청포도', 'Upcycling It', 'Co-Study in Covid World', 'TTV'],
    ['MOME MATE', '매일메일', '쉿', '욕설감지기', '글적글적', '블루펜슬', '너의 우산', 'My Little Farm'],
    ['TTV', 'CHAIN POST', 'CANETIS', 'For Moon', 'Witch', 'Dr. Daily', '바람', '워커홀릭'],
  ],
  qnaVideoUrl: 'https://www.youtube.com/embed/hIX8CQHqW-M?wmode=transparent&rel=0&controls=0',
};

export const SETTING_DESCRIPTIONS: Record<string, string> = {
  [SETTING_KEYS.projectCount]: '홈: "N개의 프로젝트" 의 N',
  [SETTING_KEYS.contestCount]: '홈/업적: "N개의 대회" 의 N',
  [SETTING_KEYS.prizeTotal]: '홈/업적: 상금 및 지원금 총액 (예: 7,500만원)',
  [SETTING_KEYS.homeTags1]: '홈 프로젝트 섹션 태그 1줄 (쉼표로 구분)',
  [SETTING_KEYS.homeTags2]: '홈 프로젝트 섹션 태그 2줄 (쉼표로 구분)',
  [SETTING_KEYS.homeTags3]: '홈 프로젝트 섹션 태그 3줄 (쉼표로 구분)',
  [SETTING_KEYS.qnaVideoUrl]: 'Q&A 페이지 유튜브 영상 (watch / youtu.be / embed URL 모두 가능)',
};

/** 유튜브 URL 을 임베드 URL 로 정규화. youtube 도메인이 아니면 null (임의 iframe 삽입 방지). */
export function toYoutubeEmbedUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.slice('/embed/'.length);
  }
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  return `https://www.youtube.com/embed/${id}?wmode=transparent&rel=0&controls=0`;
}

const splitTags = (value: string) =>
  value
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

/** key/value 행 목록 → SiteSettings. 같은 키가 여러 번 있으면 먼저 온 행(정렬 순서 우선)을 사용한다. */
export function buildSiteSettings(rows: Array<{ key: string; value: string }>): SiteSettings {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!map.has(key) && row.value.trim() !== '') map.set(key, row.value.trim());
  }
  const pick = (key: string, fallback: string) => map.get(key) ?? fallback;
  const tags = [SETTING_KEYS.homeTags1, SETTING_KEYS.homeTags2, SETTING_KEYS.homeTags3].map((key, i) => {
    const parsed = splitTags(map.get(key) ?? '');
    return parsed.length > 0 ? parsed : DEFAULT_SETTINGS.homeTags[i]!;
  });
  const video = map.get(SETTING_KEYS.qnaVideoUrl);
  return {
    projectCount: pick(SETTING_KEYS.projectCount, DEFAULT_SETTINGS.projectCount),
    contestCount: pick(SETTING_KEYS.contestCount, DEFAULT_SETTINGS.contestCount),
    prizeTotal: pick(SETTING_KEYS.prizeTotal, DEFAULT_SETTINGS.prizeTotal),
    homeTags: tags,
    qnaVideoUrl: (video && toYoutubeEmbedUrl(video)) || DEFAULT_SETTINGS.qnaVideoUrl,
  };
}
