import { describe, expect, it } from 'vitest';
import { NotionApiError } from '@/lib/errors';
import { NOTION_VERSION, NotionClient } from '@/services/notion/client';

type Call = { url: string; init: RequestInit };

function client(responses: Array<() => Response | Promise<Response>>, opts: { maxRetries?: number } = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchImpl = (async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  }) as unknown as typeof fetch;
  const c = new NotionClient({ token: 'ntn_test_token_value', fetchImpl, sleep: async (ms) => void sleeps.push(ms), requestsPerSecond: 1000, ...opts });
  return { c, calls, sleeps };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const list = (ids: string[], next: string | null, extra: Record<string, unknown> = {}) =>
  json({ object: 'list', results: ids.map((id) => ({ object: 'page', id, properties: {}, last_edited_time: '2026-01-01T00:00:00.000Z' })), next_cursor: next, has_more: next !== null, ...extra });

describe('NotionClient', () => {
  it('최신 Notion-Version 과 Bearer 토큰 헤더를 보낸다', async () => {
    const { c, calls } = client([json({ object: 'page', id: 'p' })]);
    await c.retrievePage('p');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Notion-Version']).toBe(NOTION_VERSION);
    expect(NOTION_VERSION).toBe('2026-03-11');
    expect(headers.Authorization).toBe('Bearer ntn_test_token_value');
  });

  it('429 는 Retry-After(초) 만큼 기다린 뒤 재시도', async () => {
    const { c, sleeps, calls } = client([json({ code: 'rate_limited' }, 429, { 'retry-after': '2' }), json({ object: 'page', id: 'p' })]);
    await c.retrievePage('p');
    expect(calls).toHaveLength(2);
    expect(sleeps.some((ms) => ms >= 2000 && ms < 2300)).toBe(true);
  });

  it('조회(POST query)는 5xx 를 백오프로 재시도하고, 쓰기(POST create)는 재시도하지 않는다', async () => {
    const q = client([json({ code: 'internal_server_error' }, 503), list(['a'], null)]);
    const res = await q.c.queryDataSource('ds', {});
    expect(res.results).toHaveLength(1);
    expect(q.calls).toHaveLength(2);

    const w = client([json({ code: 'internal_server_error', message: 'boom' }, 503), json({ id: 'x' })]);
    await expect(w.c.createPage({})).rejects.toBeInstanceOf(NotionApiError);
    expect(w.calls).toHaveLength(1);
  });

  it('재시도 한도를 넘거나 4xx 이면 NotionApiError (메시지에 토큰 미포함)', async () => {
    const { c } = client([json({ code: 'object_not_found', message: 'Could not find data source' }, 404)]);
    const err = await c.retrievePage('p').catch((e) => e);
    expect(err).toBeInstanceOf(NotionApiError);
    expect((err as NotionApiError).httpStatus).toBe(404);
    expect(String((err as Error).message)).not.toContain('ntn_test_token_value');

    const many = client(Array.from({ length: 4 }, () => json({ code: 'service_unavailable' }, 503)), { maxRetries: 2 });
    await expect(many.c.retrievePage('p')).rejects.toBeInstanceOf(NotionApiError);
    expect(many.calls).toHaveLength(3);
  });

  it('public_api_request_blocked 429 는 재시도하지 않는다', async () => {
    const { c, calls } = client([json({ code: 'public_api_request_blocked' }, 429), json({})]);
    await expect(c.retrievePage('p')).rejects.toBeInstanceOf(NotionApiError);
    expect(calls).toHaveLength(1);
  });

  it('네트워크 오류는 조회 요청에 한해 재시도', async () => {
    const { c, calls } = client([() => Promise.reject(new TypeError('fetch failed')), json({ object: 'page', id: 'p' })]);
    await c.retrievePage('p');
    expect(calls).toHaveLength(2);
  });

  it('queryAll 은 next_cursor 를 따라 모든 페이지를 모으고, 결과 상한 도달 여부를 알려준다', async () => {
    const { c, calls } = client([list(['a', 'b'], 'c1'), list(['c'], 'c2'), list(['d'], null, { request_status: { type: 'incomplete', incomplete_reason: 'query_result_limit_reached' } })]);
    const res = await c.queryAll('ds', { filterProperties: ['title'] });
    expect(res.pages.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(res.complete).toBe(false);
    expect(JSON.parse(String(calls[1]!.init.body)).start_cursor).toBe('c1');
    expect(calls[0]!.url).toContain('filter_properties%5B%5D=title');
  });
});
