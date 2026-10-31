import { describe, expect, it } from 'vitest';
import { buildSiteSettings, DEFAULT_SETTINGS, SETTING_KEYS, toYoutubeEmbedUrl } from '@/services/content/settings';

describe('사이트 설정', () => {
  it('값이 없으면 원본 하드코딩 값을 기본값으로 사용', () => {
    expect(buildSiteSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it('Notion 값으로 덮어쓰고, 태그는 쉼표/줄바꿈으로 분리, 같은 키는 먼저 온 행 우선', () => {
    const s = buildSiteSettings([
      { key: SETTING_KEYS.projectCount, value: '80' },
      { key: SETTING_KEYS.projectCount, value: '999' },
      { key: SETTING_KEYS.homeTags2, value: 'A, B\nC' },
      { key: SETTING_KEYS.prizeTotal, value: '  ' },
    ]);
    expect(s.projectCount).toBe('80');
    expect(s.homeTags[1]).toEqual(['A', 'B', 'C']);
    expect(s.homeTags[0]).toEqual(DEFAULT_SETTINGS.homeTags[0]);
    expect(s.prizeTotal).toBe(DEFAULT_SETTINGS.prizeTotal);
  });

  it('유튜브 URL 을 임베드 URL 로 정규화하고 다른 도메인은 거부 (임의 iframe 방지)', () => {
    const embed = 'https://www.youtube.com/embed/hIX8CQHqW-M?wmode=transparent&rel=0&controls=0';
    expect(toYoutubeEmbedUrl('https://www.youtube.com/watch?v=hIX8CQHqW-M')).toBe(embed);
    expect(toYoutubeEmbedUrl('https://youtu.be/hIX8CQHqW-M')).toBe(embed);
    expect(toYoutubeEmbedUrl('https://www.youtube.com/embed/hIX8CQHqW-M?x=1')).toBe(embed);
    expect(toYoutubeEmbedUrl('https://evil.example.com/embed/hIX8CQHqW-M')).toBeNull();
    expect(toYoutubeEmbedUrl('javascript:alert(1)')).toBeNull();
    expect(buildSiteSettings([{ key: SETTING_KEYS.qnaVideoUrl, value: 'https://evil.example.com/x' }]).qnaVideoUrl).toBe(DEFAULT_SETTINGS.qnaVideoUrl);
  });
});
