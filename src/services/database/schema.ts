import { sql } from 'drizzle-orm';
import {
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * 콘텐츠 테이블 공통 규칙
 * - notion_page_id: Notion 페이지 ID(UUID). Upsert 기준이 되는 고유 키.
 *   (Notion 연동 전 로컬 시드 데이터는 'seed:<collection>:<n>' 형태를 사용하며, 첫 전체 동기화에서 정리된다)
 * - status: published(노출) / hidden(Notion 에서 '공개' 체크 해제) / deleted(Notion 에서 삭제·휴지통 이동)
 *   삭제는 soft delete 로 처리해 이력과 이미지 참조를 보존한다.
 * - content_hash: 변환된 레코드의 해시. 같으면 쓰기를 건너뛴다(불필요한 재처리 방지).
 */

export const contentStatus = pgEnum('content_status', ['published', 'hidden', 'deleted']);
export type ContentStatus = (typeof contentStatus.enumValues)[number];

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)),
});

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 컬럼 빌더는 테이블마다 새로 만들어야 한다 (공유하면 제약 이름이 섞인다)
const syncColumns = () => ({
  notionPageId: text('notion_page_id').notNull().unique(),
  sortOrder: doublePrecision('sort_order').notNull().default(0),
  status: contentStatus('status').notNull().default('published'),
  notionLastEditedAt: timestamp('notion_last_edited_at', { withTimezone: true }),
  contentHash: text('content_hash'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps(),
});

/** 동기화 시 Notion 에서 내려받아 WebP 로 변환한 이미지. id 는 변환 결과의 sha256 (content-addressed). */
export const media = pgTable(
  'media',
  {
    id: text('id').primaryKey(),
    sourceKey: text('source_key').notNull(),
    contentType: text('content_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: integer('byte_size').notNull(),
    data: bytea('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('media_source_key_idx').on(t.sourceKey)],
);

const imageColumns = () => ({
  imageId: text('image_id').references(() => media.id, { onDelete: 'set null' }),
  /** Notion 파일의 안정적인 식별자(서명 쿼리 제외 URL). 같으면 이미지를 다시 받지 않는다. */
  imageSourceKey: text('image_source_key'),
});

export const members = pgTable(
  'members',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    generation: text('generation').notNull(),
    position: text('position').notNull().default(''),
    className: text('class_name').notNull().default(''),
    description: text('description').notNull().default(''),
    ...imageColumns(),
    ...syncColumns(),
  },
  (t) => [index('members_list_idx').on(t.status, t.generation, t.sortOrder)],
);

/** 멤버 탭(기수) 순서. Notion '기수' select 옵션 순서를 그대로 따른다. */
export const memberGroups = pgTable('member_groups', {
  name: text('name').primaryKey(),
  sortOrder: integer('sort_order').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const awards = pgTable(
  'awards',
  {
    id: serial('id').primaryKey(),
    year: integer('year').notNull(),
    name: text('name').notNull(),
    prize: text('prize').notNull().default(''),
    team: text('team').notNull().default(''),
    members: text('members').notNull().default(''),
    dateText: text('date_text').notNull().default(''),
    ...imageColumns(),
    ...syncColumns(),
  },
  (t) => [index('awards_list_idx').on(t.status, t.year, t.sortOrder)],
);

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    year: integer('year').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** 프로젝트 수상 내역(현재 UI 미노출, 원본 데이터 보존용) */
    awards: jsonb('awards').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    ...imageColumns(),
    ...syncColumns(),
  },
  (t) => [index('projects_list_idx').on(t.status, t.year, t.sortOrder)],
);

export const qnas = pgTable(
  'qnas',
  {
    id: serial('id').primaryKey(),
    question: text('question').notNull(),
    answer: text('answer').notNull().default(''),
    ...syncColumns(),
  },
  (t) => [index('qnas_list_idx').on(t.status, t.sortOrder)],
);

/** 화면 문구 중 운영자가 바꿀 수 있는 값(통계 수치, 홈 태그, 영상 URL 등). */
export const siteSettings = pgTable(
  'site_settings',
  {
    id: serial('id').primaryKey(),
    key: text('key').notNull(),
    value: text('value').notNull().default(''),
    ...syncColumns(),
  },
  (t) => [index('site_settings_key_idx').on(t.status, t.key)],
);

/** 컬렉션별 증분 동기화 커서와 마지막 성공 시각. */
export const syncState = pgTable('sync_state', {
  collection: text('collection').primaryKey(),
  cursor: timestamp('cursor', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFullSyncAt: timestamp('last_full_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const syncRunStatus = pgEnum('sync_run_status', ['running', 'success', 'partial', 'failed', 'skipped']);
export type SyncRunStatus = (typeof syncRunStatus.enumValues)[number];

export type CollectionStats = {
  mode: 'full' | 'incremental';
  fetched: number;
  added: number;
  updated: number;
  unchanged: number;
  deleted: number;
  hidden: number;
  restored: number;
  failed: number;
  durationMs: number;
};

export type SyncRunError = { collection?: string; pageId?: string; message: string };

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: serial('id').primaryKey(),
    trigger: text('trigger').notNull(),
    mode: text('mode').notNull(),
    status: syncRunStatus('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    stats: jsonb('stats').$type<Record<string, CollectionStats>>().notNull().default(sql`'{}'::jsonb`),
    errors: jsonb('errors').$type<SyncRunError[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [index('sync_runs_started_at_idx').on(t.startedAt), index('sync_runs_status_idx').on(t.status, t.startedAt)],
);

/** 중복 실행 방지용 임대(lease) 잠금. 커넥션 풀/서버리스 환경에서도 동작하도록 advisory lock 대신 행 기반으로 구현. */
export const syncLocks = pgTable('sync_locks', {
  name: text('name').primaryKey(),
  owner: text('owner').notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }).notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
});
