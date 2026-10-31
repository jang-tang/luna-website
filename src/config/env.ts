import { z } from 'zod';
import { ConfigError } from '@/lib/errors';

/**
 * 환경변수는 기능 단위로 나누어 "사용 시점"에 검증한다.
 * - 빌드(next build)나 프론트 렌더링은 Notion 토큰 없이도 동작해야 하므로 전역 일괄 검증을 하지 않는다.
 * - 검증 실패 메시지에는 변수 "이름"만 포함하고 값은 절대 포함하지 않는다.
 */

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const notionId = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : normalizeNotionId(v)))
  .optional();

/** Notion URL/하이픈 유무와 관계없이 UUID 형태로 정규화한다. */
export function normalizeNotionId(input: string): string {
  // URL 이면 쿼리/해시를 떼고 마지막 경로 조각의 끝 32자리 16진수를 사용 (예: .../LUNA-1f78...?pvs=4)
  const lastSegment = input.trim().split(/[?#]/)[0]!.split('/').pop() ?? '';
  const match = lastSegment.replace(/-/g, '').match(/[0-9a-f]{32}$/i);
  if (!match) throw new ConfigError(`Invalid Notion ID format`);
  const h = match[0].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function parse<T extends z.ZodType>(schema: T, scope: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new ConfigError(`[${scope}] 환경변수가 올바르지 않습니다: ${names}`);
  }
  return result.data;
}

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, 'required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_SSL: z.enum(['disable', 'require', 'prefer']).default('prefer'),
  // pgbouncer(transaction 모드) 또는 세션을 공유하는 로컬 PGlite 사용 시 false
  DATABASE_PREPARE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});

const notionSchema = z.object({
  NOTION_TOKEN: z.string().min(10, 'required'),
  NOTION_ROOT_PAGE_ID: notionId,
  NOTION_MEMBERS_DATA_SOURCE_ID: notionId,
  NOTION_AWARDS_DATA_SOURCE_ID: notionId,
  NOTION_PROJECTS_DATA_SOURCE_ID: notionId,
  NOTION_QNA_DATA_SOURCE_ID: notionId,
  NOTION_SETTINGS_DATA_SOURCE_ID: notionId,
  NOTION_REQUESTS_PER_SECOND: z.coerce.number().positive().max(10).default(2.5),
});

const syncSchema = z.object({
  SYNC_SECRET: optionalString.pipe(z.string().min(32, 'must be at least 32 characters').optional()),
  CRON_SECRET: optionalString,
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  SYNC_LOCK_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  APP_URL: optionalString.pipe(z.url().optional()),
});

const adminSchema = z.object({
  ADMIN_USER: z.string().trim().min(1).default('admin'),
  ADMIN_PASSWORD: optionalString.pipe(z.string().min(12, 'must be at least 12 characters').optional()),
});

export type DatabaseEnv = z.infer<typeof databaseSchema>;
export type NotionEnv = z.infer<typeof notionSchema>;
export type SyncEnv = z.infer<typeof syncSchema>;
export type AdminEnv = z.infer<typeof adminSchema>;

export const getDatabaseEnv = (): DatabaseEnv => parse(databaseSchema, 'database');
export const getNotionEnv = (): NotionEnv => parse(notionSchema, 'notion');
export const getSyncEnv = (): SyncEnv => parse(syncSchema, 'sync');
export const getAdminEnv = (): AdminEnv => parse(adminSchema, 'admin');

export const isProduction = () => process.env.NODE_ENV === 'production';
