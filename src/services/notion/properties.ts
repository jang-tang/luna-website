import type { NotionFile, NotionPage, NotionPropertyValue, RichText } from './types';

/**
 * Notion 페이지 속성 → 원시 값 추출기.
 * 속성 이름이나 타입이 예상과 다르면 PropertyError 를 던져 검증 단계에서 해당 페이지만 건너뛴다.
 */

export class PropertyError extends Error {}

/** Notion 은 페이지 객체에서 25개를 초과하는 rich_text/title 조각을 잘라서 반환한다. */
export const TRUNCATION_LIMIT = 25;

const joinRichText = (parts: RichText[]) => parts.map((p) => p.plain_text).join('');

function get(page: NotionPage, name: string): NotionPropertyValue | undefined {
  return page.properties[name];
}

function expectType<T extends NotionPropertyValue['type']>(prop: NotionPropertyValue | undefined, name: string, types: T[]) {
  if (!prop) throw new PropertyError(`'${name}' 속성이 없습니다`);
  if (!types.includes(prop.type as T)) throw new PropertyError(`'${name}' 속성 타입이 ${types.join('/')} 가 아닙니다 (${prop.type})`);
  return prop as Extract<NotionPropertyValue, { type: T }>;
}

export function readText(page: NotionPage, name: string, options: { optional?: boolean } = {}): string {
  const prop = get(page, name);
  if (!prop && options.optional) return '';
  const p = expectType(prop, name, ['title', 'rich_text', 'select', 'number', 'url']);
  switch (p.type) {
    case 'title':
      return joinRichText((p as { title: RichText[] }).title);
    case 'rich_text':
      return joinRichText((p as { rich_text: RichText[] }).rich_text);
    case 'select':
      return (p as { select: { name: string } | null }).select?.name ?? '';
    case 'number': {
      const n = (p as { number: number | null }).number;
      return n === null ? '' : String(n);
    }
    case 'url':
      return (p as { url: string | null }).url ?? '';
    default:
      return '';
  }
}

export function readNumber(page: NotionPage, name: string): number | null {
  const prop = get(page, name);
  if (!prop) return null;
  if (prop.type === 'number') return (prop as { number: number | null }).number;
  // 연도를 select/text 로 관리하는 경우도 허용
  const text = readText(page, name, { optional: true }).trim();
  if (text === '') return null;
  const digits = text.replace(/[^0-9.-]/g, '');
  const n = Number(digits);
  if (digits === '' || !Number.isFinite(n)) throw new PropertyError(`'${name}' 값이 숫자가 아닙니다`);
  return n;
}

/** '공개' 체크박스. 속성이 없으면 공개로 간주한다. */
export function readCheckbox(page: NotionPage, name: string, defaultValue = true): boolean {
  const prop = get(page, name);
  if (!prop) return defaultValue;
  return expectType(prop, name, ['checkbox']).checkbox as boolean;
}

export type FileRef = {
  /** 이미지 변경 감지용 안정 키 (서명 쿼리스트링 제외) */
  sourceKey: string;
  /** 다운로드 URL (Notion 호스팅 파일은 약 1시간 후 만료) */
  url: string;
  name: string;
};

export function readFirstFile(page: NotionPage, name: string): FileRef | null {
  const prop = get(page, name);
  if (!prop) return null;
  const files = expectType(prop, name, ['files']).files as NotionFile[];
  for (const file of files) {
    if (file.type === 'file') {
      const u = new URL(file.file.url);
      return { sourceKey: `notion:${u.origin}${u.pathname}`, url: file.file.url, name: file.name ?? '' };
    }
    if (file.type === 'external') {
      return { sourceKey: `external:${file.external.url}`, url: file.external.url, name: file.name ?? '' };
    }
  }
  return null;
}

/** 페이지 객체에서 잘렸을 가능성이 있는 텍스트 속성의 id 목록 */
export function truncatedTextProperties(page: NotionPage): Array<{ name: string; id: string }> {
  const out: Array<{ name: string; id: string }> = [];
  for (const [name, prop] of Object.entries(page.properties)) {
    const parts = prop.type === 'title' ? (prop as { title: RichText[] }).title : prop.type === 'rich_text' ? (prop as { rich_text: RichText[] }).rich_text : null;
    if (parts && parts.length >= TRUNCATION_LIMIT) out.push({ name, id: prop.id });
  }
  return out;
}
