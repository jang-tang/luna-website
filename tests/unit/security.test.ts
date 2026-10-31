import { afterEach, describe, expect, it } from 'vitest';
import { normalizeNotionId } from '@/config/env';
import { assertSyncAuthorized } from '@/lib/api';
import { AppError, UnauthorizedError } from '@/lib/errors';
import { redact } from '@/lib/logger';
import { safeEqual } from '@/lib/safe-equal';
import { assertPublicHttpUrl, ImageError } from '@/services/notion/images';

describe('보안 유틸리티', () => {
  afterEach(() => {
    delete process.env.NOTION_TOKEN;
  });

  it('로그에서 토큰/비밀번호/서명 URL 을 가린다', () => {
    process.env.NOTION_TOKEN = 'ntn_abcdefghijklmnopqrstuvwxyz0123456789';
    const out = redact(
      'token=ntn_abcdefghijklmnopqrstuvwxyz0123456789 Authorization: Bearer abc.def.ghi postgres://u:secretpw@db:5432/x https://s3/x.png?X-Amz-Signature=deadbeef&a=1 secret_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
    );
    expect(out).not.toContain('ntn_abcdef');
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain('secretpw');
    expect(out).not.toContain('deadbeef');
    expect(out).not.toContain('secret_ABCDEF');
  });

  it('상수 시간 비교', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('한글', '한글')).toBe(true);
  });

  it('동기화 엔드포인트 인증', () => {
    const req = (auth?: string) => new Request('http://x/api/cron/sync', { headers: auth ? { authorization: auth } : {} });
    const secret = 'x'.repeat(40);
    expect(() => assertSyncAuthorized(req(`Bearer ${secret}`), [secret])).not.toThrow();
    expect(() => assertSyncAuthorized(req(`Bearer wrong`), [secret])).toThrow(UnauthorizedError);
    expect(() => assertSyncAuthorized(req(), [secret])).toThrow(UnauthorizedError);
    expect(() => assertSyncAuthorized(req(`Bearer ${secret}`), [undefined])).toThrow(AppError);
  });

  it('외부 이미지 URL 의 사설망 주소를 차단한다 (SSRF)', () => {
    for (const bad of ['http://localhost/a.png', 'http://127.0.0.1/a', 'http://10.0.0.5/a', 'http://192.168.0.1/a', 'http://169.254.169.254/latest', 'http://[::1]/a', 'file:///etc/passwd', 'http://db.internal/a']) {
      expect(() => assertPublicHttpUrl(bad), bad).toThrow(ImageError);
    }
    expect(assertPublicHttpUrl('https://prod-files-secure.s3.us-west-2.amazonaws.com/a.png').hostname).toContain('amazonaws.com');
  });

  it('Notion ID/URL 정규화', () => {
    expect(normalizeNotionId('https://www.notion.so/workspace/LUNA-1f7838a75bf080ba9195c82c48876879?pvs=4')).toBe('1f7838a7-5bf0-80ba-9195-c82c48876879');
    expect(normalizeNotionId('1f7838a7-5bf0-80ba-9195-c82c48876879')).toBe('1f7838a7-5bf0-80ba-9195-c82c48876879');
    expect(() => normalizeNotionId('not-an-id')).toThrow();
  });
});
