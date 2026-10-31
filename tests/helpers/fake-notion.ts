import sharp from 'sharp';
import type { NotionPage } from '@/services/notion/types';

/**
 * Notion REST API 의 동기화 관련 동작을 흉내 낸 인메모리 서버 (fetch 대체).
 * - data_sources/:id/query: last_edited_time 필터, filter_properties, page_size/start_cursor 페이지네이션, 휴지통 제외
 * - pages/:id, data_sources/:id, pages/:id/properties/:pid
 * - 이미지 다운로드 (files.example.com)
 * - 장애 주입: 특정 데이터 소스 쿼리 실패, 특정 이미지 실패
 */

type Prop = Record<string, unknown> & { id: string; type: string };
type Store = { schema: Record<string, { id: string; name: string; type: string; select?: { options: Array<{ id: string; name: string }> } }>; pages: Map<string, NotionPage & { in_trash: boolean }> };

const rt = (s: string) => [{ type: 'text', plain_text: s, text: { content: s } }];
let seq = 0;
const uuid = () => {
  seq++;
  const hex = seq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
};
const nowMinute = () => new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();

export const P = {
  title: (s: string): Prop => ({ id: 'title', type: 'title', title: rt(s) }),
  text: (s: string, id = 'txt'): Prop => ({ id, type: 'rich_text', rich_text: rt(s) }),
  textParts: (parts: string[], id: string): Prop => ({ id, type: 'rich_text', rich_text: parts.flatMap(rt) }),
  number: (n: number | null): Prop => ({ id: 'num', type: 'number', number: n }),
  select: (s: string | null): Prop => ({ id: 'sel', type: 'select', select: s ? { name: s } : null }),
  check: (b: boolean): Prop => ({ id: 'chk', type: 'checkbox', checkbox: b }),
  multi: (names: string[]): Prop => ({ id: 'ms', type: 'multi_select', multi_select: names.map((name) => ({ name })) }),
  date: (start: string | null, end: string | null = null): Prop => ({ id: 'dt', type: 'date', date: start ? { start, end } : null }),
  file: (key: string): Prop => ({
    id: 'files',
    type: 'files',
    files: [{ type: 'file', name: `${key}.png`, file: { url: `https://files.example.com/${key}.png?X-Amz-Signature=${Math.random().toString(36).slice(2)}` } }],
  }),
  noFile: (): Prop => ({ id: 'files', type: 'files', files: [] }),
};

export class FakeNotion {
  stores = new Map<string, Store>();
  failingQueries = new Set<string>();
  failingImages = new Set<string>();
  /** 200 으로 응답하지만 이미지가 아닌 데이터 (변환 불가 형식 흉내) */
  brokenImages = new Set<string>();
  imageDownloads = 0;
  requests: string[] = [];
  pageSize = 3; // 작은 페이지 크기로 페이지네이션 경로를 항상 거치게 한다
  private propertyPages = new Map<string, unknown[]>();

  addDataSource(id: string, schema: Store['schema'] = {}) {
    this.stores.set(id, { schema, pages: new Map() });
    return id;
  }

  addPage(dataSourceId: string, properties: Record<string, Prop>): string {
    const id = uuid();
    const t = nowMinute();
    this.stores.get(dataSourceId)!.pages.set(id, { object: 'page', id, created_time: t, last_edited_time: t, in_trash: false, properties: properties as NotionPage['properties'] });
    return id;
  }

  updatePage(dataSourceId: string, id: string, patch: Record<string, Prop>, options: { touch?: boolean } = {}) {
    const page = this.stores.get(dataSourceId)!.pages.get(id)!;
    page.properties = { ...page.properties, ...(patch as NotionPage['properties']) };
    if (options.touch !== false) page.last_edited_time = nowMinute();
  }

  trashPage(dataSourceId: string, id: string, trashed = true) {
    const page = this.stores.get(dataSourceId)!.pages.get(id)!;
    page.in_trash = trashed;
  }

  removeAll(dataSourceId: string) {
    this.stores.get(dataSourceId)!.pages.clear();
  }

  /** property item API 로만 전체 값을 얻을 수 있는(잘린) 속성 등록 */
  setFullPropertyItems(pageId: string, propId: string, parts: string[]) {
    this.propertyPages.set(`${pageId}/${propId}`, parts.map((s) => ({ object: 'property_item', type: 'rich_text', rich_text: rt(s)[0] })));
  }

  fetch = (async (input: URL | string, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    this.requests.push(`${method} ${url.pathname}`);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url.hostname === 'files.example.com') {
      const key = url.pathname.slice(1).replace('.png', '');
      if (this.failingImages.has(key)) return new Response('nope', { status: 500 });
      if (this.brokenImages.has(key)) {
        this.imageDownloads++;
        return new Response('not really an image', { headers: { 'content-type': 'image/heic' } });
      }
      this.imageDownloads++;
      const seed = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
      const img = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: seed % 255, g: (seed * 7) % 255, b: (seed * 13) % 255 } } }).png().toBuffer();
      return new Response(new Uint8Array(img), { headers: { 'content-type': 'image/png' } });
    }

    let m = url.pathname.match(/^\/v1\/data_sources\/([^/]+)\/query$/);
    if (m && method === 'POST') {
      const id = m[1]!;
      if (this.failingQueries.has(id)) return json({ object: 'error', code: 'internal_server_error', message: 'injected' }, 500);
      const store = this.stores.get(id);
      if (!store) return json({ object: 'error', code: 'object_not_found', message: 'not found' }, 404);
      const body = JSON.parse(String(init?.body ?? '{}')) as { filter?: { last_edited_time?: { on_or_after?: string } }; start_cursor?: string; page_size?: number };
      const after = body.filter?.last_edited_time?.on_or_after;
      let pages = [...store.pages.values()].filter((p) => !p.in_trash);
      if (after) pages = pages.filter((p) => p.last_edited_time >= new Date(after).toISOString());
      const start = body.start_cursor ? Number(body.start_cursor) : 0;
      const size = Math.min(body.page_size ?? 100, this.pageSize);
      const slice = pages.slice(start, start + size);
      const only = url.searchParams.getAll('filter_properties[]');
      const results = slice.map((p) =>
        only.length ? { ...p, properties: Object.fromEntries(Object.entries(p.properties).filter(([, v]) => only.includes(v.id))) } : structuredClone(p),
      );
      const next = start + size < pages.length ? String(start + size) : null;
      return json({ object: 'list', results, next_cursor: next, has_more: next !== null, request_status: { type: 'complete' } });
    }

    m = url.pathname.match(/^\/v1\/pages\/([^/]+)\/properties\/([^/]+)$/);
    if (m) {
      const items = this.propertyPages.get(`${m[1]}/${decodeURIComponent(m[2]!)}`) ?? [];
      return json({ object: 'list', results: items, next_cursor: null, has_more: false });
    }

    m = url.pathname.match(/^\/v1\/pages\/([^/]+)$/);
    if (m) {
      for (const store of this.stores.values()) {
        const p = store.pages.get(m[1]!);
        if (p) return json(structuredClone(p));
      }
      return json({ object: 'error', code: 'object_not_found', message: 'not found' }, 404);
    }

    m = url.pathname.match(/^\/v1\/data_sources\/([^/]+)$/);
    if (m) {
      const store = this.stores.get(m[1]!);
      if (!store) return json({ object: 'error', code: 'object_not_found', message: 'not found' }, 404);
      return json({ object: 'data_source', id: m[1], properties: store.schema });
    }

    return json({ object: 'error', code: 'invalid_request_url', message: url.pathname }, 400);
  }) as unknown as typeof fetch;
}
