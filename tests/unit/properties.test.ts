import { describe, expect, it } from 'vitest';
import { PropertyError, readCheckbox, readFirstFile, readNumber, readText, truncatedTextProperties } from '@/services/notion/properties';
import type { NotionPage } from '@/services/notion/types';

const rt = (s: string) => [{ type: 'text', plain_text: s }];
const page = (properties: Record<string, unknown>): NotionPage =>
  ({ object: 'page', id: 'p1', created_time: '', last_edited_time: '', properties }) as unknown as NotionPage;

describe('Notion 속성 파서', () => {
  it('title/rich_text/select/number 를 문자열로 읽는다', () => {
    const p = page({
      이름: { id: 'title', type: 'title', title: [...rt('서'), ...rt('승표')] },
      소개: { id: 'a', type: 'rich_text', rich_text: rt('루나 쌉조아') },
      기수: { id: 'b', type: 'select', select: { name: 'LUNA 7기' } },
      연도: { id: 'c', type: 'number', number: 2023 },
    });
    expect(readText(p, '이름')).toBe('서승표');
    expect(readText(p, '소개')).toBe('루나 쌉조아');
    expect(readText(p, '기수')).toBe('LUNA 7기');
    expect(readNumber(p, '연도')).toBe(2023);
  });

  it('필수 속성이 없거나 타입이 다르면 PropertyError', () => {
    const p = page({ 공개: { id: 'x', type: 'checkbox', checkbox: true } });
    expect(() => readText(p, '이름')).toThrow(PropertyError);
    expect(() => readText(p, '공개')).toThrow(PropertyError);
    expect(readText(p, '소개', { optional: true })).toBe('');
  });

  it('select/text 로 된 연도도 숫자로 변환하고, 숫자가 아니면 오류', () => {
    expect(readNumber(page({ 연도: { id: 'c', type: 'select', select: { name: '2021' } } }), '연도')).toBe(2021);
    expect(() => readNumber(page({ 연도: { id: 'c', type: 'rich_text', rich_text: rt('작년') } }), '연도')).toThrow(PropertyError);
    expect(readNumber(page({}), '연도')).toBeNull();
  });

  it('공개 체크박스가 없으면 공개로 간주', () => {
    expect(readCheckbox(page({}), '공개')).toBe(true);
    expect(readCheckbox(page({ 공개: { id: 'x', type: 'checkbox', checkbox: false } }), '공개')).toBe(false);
  });

  it('Notion 호스팅 파일의 sourceKey 는 서명 쿼리스트링을 제외해 매번 같다', () => {
    const mk = (sig: string) =>
      page({ 사진: { id: 'f', type: 'files', files: [{ type: 'file', name: 'a.png', file: { url: `https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/abc/a.png?X-Amz-Signature=${sig}` } }] } });
    const a = readFirstFile(mk('111'), '사진');
    const b = readFirstFile(mk('222'), '사진');
    expect(a?.sourceKey).toBe(b?.sourceKey);
    expect(a?.url).toContain('X-Amz-Signature=111');
    expect(readFirstFile(page({ 사진: { id: 'f', type: 'files', files: [] } }), '사진')).toBeNull();
  });

  it('25조각 이상인 텍스트 속성을 잘림 후보로 표시한다', () => {
    const many = Array.from({ length: 25 }, () => rt('x')[0]);
    const p = page({ 답변: { id: 'ans', type: 'rich_text', rich_text: many }, 질문: { id: 'title', type: 'title', title: rt('q') } });
    expect(truncatedTextProperties(p)).toEqual([{ name: '답변', id: 'ans' }]);
  });
});
