import { NotionApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { NotionDataSource, NotionList, NotionPage, NotionPropertyItemList } from './types';

/**
 * Notion REST API 최소 클라이언트 (fetch 기반, 의존성 없음).
 * - Notion-Version 2026-03-11 (2025-09-03 의 database/data source 분리 + archived → in_trash)
 * - 요청 간 최소 간격으로 초당 요청 수 제한 (공식 한도: 연결당 평균 3 req/s)
 * - 429/529 는 Retry-After 를 준수하고, 5xx/네트워크 오류/타임아웃은 지수 백오프 + 지터로 재시도
 * - 쓰기 요청(POST 생성 등)은 rate limit 응답을 제외하고 재시도하지 않는다 (중복 생성 방지)
 * - 토큰은 Authorization 헤더에만 사용하며 에러/로그에 포함하지 않는다
 */

export const NOTION_VERSION = '2026-03-11';
const BASE_URL = 'https://api.notion.com/v1';

export type NotionClientOptions = {
  token: string;
  requestsPerSecond?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type RequestOptions = {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  /** 읽기 전용이거나 멱등한 요청이면 true (5xx 재시도 허용) */
  idempotent?: boolean;
  formData?: FormData;
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class NotionClient {
  private readonly token: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  requestCount = 0;

  constructor(options: NotionClientOptions) {
    if (!options.token) throw new Error('Notion token is required');
    this.token = options.token;
    this.minIntervalMs = 1000 / (options.requestsPerSecond ?? 2.5);
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 5;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** 모든 요청을 직렬 큐에 넣어 최소 간격을 보장한다. */
  private throttle(): Promise<void> {
    const next = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = Date.now();
    });
    this.queue = next.catch(() => {});
    return next;
  }

  async request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
      else url.searchParams.set(key, value);
    }
    const idempotent = options.idempotent ?? method === 'GET';

    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      this.requestCount++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Notion-Version': NOTION_VERSION,
            ...(options.formData ? {} : { 'Content-Type': 'application/json' }),
          },
          body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);
        // 네트워크 오류/타임아웃: 쓰기 요청은 처리 여부를 알 수 없으므로 재시도하지 않는다
        const reason = controller.signal.aborted ? 'timeout' : 'network';
        if (idempotent && attempt < this.maxRetries) {
          const delay = this.backoff(attempt);
          logger.warn('notion.retry', { path, reason, attempt: attempt + 1, delayMs: delay });
          await this.sleep(delay);
          continue;
        }
        throw new NotionApiError(0, reason, `${method} ${path} failed (${reason})`, true);
      }
      clearTimeout(timer);

      if (response.ok) return (await response.json()) as T;

      let payload: { code?: string; message?: string } = {};
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        // 본문이 JSON 이 아닐 수 있음
      }
      const code = payload.code ?? 'unknown';
      const isRateLimit = response.status === 429 || response.status === 529;
      // public_api_request_blocked 는 재시도해도 해결되지 않는다
      const retryable = RETRYABLE_STATUS.has(response.status) && code !== 'public_api_request_blocked' && (idempotent || isRateLimit);

      if (retryable && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 + Math.random() * 250 : this.backoff(attempt);
        logger.warn('notion.retry', { path, status: response.status, code, attempt: attempt + 1, delayMs: Math.round(delay) });
        await this.sleep(delay);
        continue;
      }
      throw new NotionApiError(response.status, code, (payload.message ?? response.statusText).slice(0, 300), retryable);
    }
  }

  private backoff(attempt: number) {
    const base = Math.min(30_000, 500 * 2 ** attempt);
    return base / 2 + Math.random() * (base / 2);
  }

  // ---- 조회 ----

  queryDataSource(
    dataSourceId: string,
    params: { filter?: unknown; sorts?: unknown; startCursor?: string; pageSize?: number; filterProperties?: string[] },
  ) {
    return this.request<NotionList<NotionPage>>('POST', `/data_sources/${dataSourceId}/query`, {
      idempotent: true,
      query: { 'filter_properties[]': params.filterProperties },
      body: {
        ...(params.filter ? { filter: params.filter } : {}),
        ...(params.sorts ? { sorts: params.sorts } : {}),
        ...(params.startCursor ? { start_cursor: params.startCursor } : {}),
        page_size: params.pageSize ?? 100,
      },
    });
  }

  /**
   * 데이터 소스의 모든 페이지를 페이지네이션하며 순회한다.
   * complete=false 이면 Notion 의 쿼리 결과 상한(10,000건)에 걸린 것이므로 호출 측에서 삭제 판정에 사용하면 안 된다.
   */
  async queryAll(
    dataSourceId: string,
    params: { filter?: unknown; sorts?: unknown; filterProperties?: string[] } = {},
  ): Promise<{ pages: NotionPage[]; complete: boolean }> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    let complete = true;
    do {
      const res = await this.queryDataSource(dataSourceId, { ...params, startCursor: cursor });
      pages.push(...res.results.filter((r): r is NotionPage => r.object === 'page'));
      if (res.request_status?.type === 'incomplete') complete = false;
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);
    return { pages, complete };
  }

  retrievePage(pageId: string) {
    return this.request<NotionPage>('GET', `/pages/${pageId}`);
  }

  retrieveDataSource(dataSourceId: string) {
    return this.request<NotionDataSource>('GET', `/data_sources/${dataSourceId}`);
  }

  /** 페이지 객체에서 잘린(25개 초과) rich_text/title 값을 전부 가져온다. */
  async retrieveFullPropertyItems(pageId: string, propertyId: string) {
    const items: NotionPropertyItemList['results'] = [];
    let cursor: string | undefined;
    do {
      const res = await this.request<NotionPropertyItemList>('GET', `/pages/${pageId}/properties/${encodeURIComponent(propertyId)}`, {
        query: { start_cursor: cursor, page_size: '100' },
      });
      items.push(...res.results);
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);
    return items;
  }

  search(params: { query?: string; filter?: unknown; startCursor?: string }) {
    return this.request<NotionList<{ object: string; id: string } & Record<string, unknown>>>('POST', '/search', {
      idempotent: true,
      body: {
        ...(params.query ? { query: params.query } : {}),
        ...(params.filter ? { filter: params.filter } : {}),
        ...(params.startCursor ? { start_cursor: params.startCursor } : {}),
        page_size: 100,
      },
    });
  }

  // ---- 쓰기 (부트스트랩 스크립트 전용) ----

  createDatabase(body: unknown) {
    return this.request<{ id: string; url?: string; data_sources?: Array<{ id: string; name: string }> }>('POST', '/databases', { body });
  }

  createPage(body: unknown) {
    return this.request<NotionPage>('POST', '/pages', { body });
  }

  createFileUpload(filename: string, contentType: string) {
    return this.request<{ id: string; status: string }>('POST', '/file_uploads', {
      body: { filename, content_type: contentType },
    });
  }

  sendFileUpload(fileUploadId: string, data: Buffer, filename: string, contentType: string) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type: contentType }), filename);
    return this.request<{ id: string; status: string }>('POST', `/file_uploads/${fileUploadId}/send`, { formData: form });
  }
}
