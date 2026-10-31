import { z } from 'zod';
import type { NotionEnv } from '@/config/env';
import type { CollectionKey } from '@/services/cache/tags';
import { awards, members, projects, qnas, siteSettings } from '@/services/database/schema';
import { readCheckbox, readFirstFile, readNumber, readText, type FileRef } from './properties';
import type { NotionPage } from './types';

/**
 * Notion 데이터 소스 ↔ DB 테이블 매핑 정의.
 * 새 콘텐츠 영역을 추가할 때는 이 파일에 정의를 하나 추가하고 테이블/마이그레이션/쿼리를 만들면 된다.
 *
 * Notion 속성 이름은 운영자가 쓰기 쉽도록 한국어로 정했다. 이름을 바꾸려면 PROPS 만 수정하면 된다.
 */

export const PROPS = {
  members: { name: '이름', generation: '기수', position: '역할', className: '소속', description: '소개', image: '사진', order: '순서', published: '공개' },
  awards: { name: '대회명', year: '연도', prize: '수상', team: '팀', members: '참여자', date: '일자', image: '사진', order: '순서', published: '공개' },
  projects: { name: '프로젝트명', year: '연도', description: '설명', awards: '수상 내역', image: '이미지', order: '순서', published: '공개' },
  qna: { question: '질문', answer: '답변', order: '순서', published: '공개' },
  settings: { key: '키', value: '값', description: '설명', order: '순서', published: '공개' },
} as const;

export type ImageVariant = { width: number; height: number; fit: 'cover' | 'inside'; quality: number };

/** 표시 크기의 2배 해상도. (멤버 140px 원형, 업적 카드 폭 최대 ~1040px × 160px cover, 프로젝트 140px contain) */
export const IMAGE_VARIANTS = {
  members: { width: 280, height: 280, fit: 'cover', quality: 82 },
  awards: { width: 1280, height: 1280, fit: 'inside', quality: 78 },
  projects: { width: 280, height: 280, fit: 'inside', quality: 85 },
} satisfies Record<string, ImageVariant>;

const text = (max: number) => z.string().trim().max(max);
const year = z.number().int().min(1990).max(2100);

export type Transformed<R> = {
  record: R;
  image: FileRef | null;
  sortOrder: number;
  published: boolean;
};

export type CollectionDef<R extends Record<string, unknown> = Record<string, unknown>> = {
  key: CollectionKey;
  label: string;
  envKey: keyof Pick<
    NotionEnv,
    'NOTION_MEMBERS_DATA_SOURCE_ID' | 'NOTION_AWARDS_DATA_SOURCE_ID' | 'NOTION_PROJECTS_DATA_SOURCE_ID' | 'NOTION_QNA_DATA_SOURCE_ID' | 'NOTION_SETTINGS_DATA_SOURCE_ID'
  >;
  // drizzle 테이블 (공통 sync 컬럼 보유). 컬렉션마다 컬럼 구성이 달라 느슨한 타입을 사용한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  titleProperty: string;
  schema: z.ZodType<R>;
  transform: (page: NotionPage) => Transformed<unknown>;
  imageVariant?: ImageVariant;
  /** Notion 데이터베이스 생성용 속성 스키마 (부트스트랩 스크립트) */
  notionProperties: Record<string, unknown>;
};

const orderOf = (page: NotionPage, name: string) => readNumber(page, name) ?? Number.MAX_SAFE_INTEGER / 2;

const memberSchema = z.object({
  name: text(100).min(1),
  generation: text(100).min(1),
  position: text(100),
  className: text(100),
  description: text(500),
});

const awardSchema = z.object({
  year,
  name: text(200).min(1),
  prize: text(100),
  team: text(100),
  members: text(500),
  dateText: text(100),
});

const projectSchema = z.object({
  year,
  name: text(200).min(1),
  description: text(2000),
  awards: z.array(text(300)).max(50),
});

const qnaSchema = z.object({
  question: text(500).min(1),
  answer: text(10_000),
});

const settingSchema = z.object({
  key: text(100).min(1),
  value: text(5000),
});

const P = PROPS;

export const COLLECTIONS = {
  members: {
    key: 'members',
    label: '멤버',
    envKey: 'NOTION_MEMBERS_DATA_SOURCE_ID',
    table: members,
    titleProperty: P.members.name,
    schema: memberSchema,
    imageVariant: IMAGE_VARIANTS.members,
    transform: (page) => ({
      record: {
        name: readText(page, P.members.name),
        generation: readText(page, P.members.generation),
        position: readText(page, P.members.position, { optional: true }),
        className: readText(page, P.members.className, { optional: true }),
        description: readText(page, P.members.description, { optional: true }),
      },
      image: readFirstFile(page, P.members.image),
      sortOrder: orderOf(page, P.members.order),
      published: readCheckbox(page, P.members.published),
    }),
    notionProperties: {
      [P.members.name]: { title: {} },
      [P.members.generation]: { select: { options: [] } },
      [P.members.position]: { select: { options: [] } },
      [P.members.className]: { rich_text: {} },
      [P.members.description]: { rich_text: {} },
      [P.members.image]: { files: {} },
      [P.members.order]: { number: { format: 'number' } },
      [P.members.published]: { checkbox: {} },
    },
  },
  awards: {
    key: 'awards',
    label: '업적',
    envKey: 'NOTION_AWARDS_DATA_SOURCE_ID',
    table: awards,
    titleProperty: P.awards.name,
    schema: awardSchema,
    imageVariant: IMAGE_VARIANTS.awards,
    transform: (page) => ({
      record: {
        year: readNumber(page, P.awards.year),
        name: readText(page, P.awards.name),
        prize: readText(page, P.awards.prize, { optional: true }),
        team: readText(page, P.awards.team, { optional: true }),
        members: readText(page, P.awards.members, { optional: true }),
        dateText: readText(page, P.awards.date, { optional: true }),
      },
      image: readFirstFile(page, P.awards.image),
      sortOrder: orderOf(page, P.awards.order),
      published: readCheckbox(page, P.awards.published),
    }),
    notionProperties: {
      [P.awards.name]: { title: {} },
      [P.awards.year]: { number: { format: 'number' } },
      [P.awards.prize]: { rich_text: {} },
      [P.awards.team]: { rich_text: {} },
      [P.awards.members]: { rich_text: {} },
      [P.awards.date]: { rich_text: {} },
      [P.awards.image]: { files: {} },
      [P.awards.order]: { number: { format: 'number' } },
      [P.awards.published]: { checkbox: {} },
    },
  },
  projects: {
    key: 'projects',
    label: '프로젝트',
    envKey: 'NOTION_PROJECTS_DATA_SOURCE_ID',
    table: projects,
    titleProperty: P.projects.name,
    schema: projectSchema,
    imageVariant: IMAGE_VARIANTS.projects,
    transform: (page) => ({
      record: {
        year: readNumber(page, P.projects.year),
        name: readText(page, P.projects.name),
        description: readText(page, P.projects.description, { optional: true }),
        awards: readText(page, P.projects.awards, { optional: true })
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      image: readFirstFile(page, P.projects.image),
      sortOrder: orderOf(page, P.projects.order),
      published: readCheckbox(page, P.projects.published),
    }),
    notionProperties: {
      [P.projects.name]: { title: {} },
      [P.projects.year]: { number: { format: 'number' } },
      [P.projects.description]: { rich_text: {} },
      [P.projects.awards]: { rich_text: {} },
      [P.projects.image]: { files: {} },
      [P.projects.order]: { number: { format: 'number' } },
      [P.projects.published]: { checkbox: {} },
    },
  },
  qna: {
    key: 'qna',
    label: 'Q&A',
    envKey: 'NOTION_QNA_DATA_SOURCE_ID',
    table: qnas,
    titleProperty: P.qna.question,
    schema: qnaSchema,
    transform: (page) => ({
      record: {
        question: readText(page, P.qna.question),
        answer: readText(page, P.qna.answer, { optional: true }),
      },
      image: null,
      sortOrder: orderOf(page, P.qna.order),
      published: readCheckbox(page, P.qna.published),
    }),
    notionProperties: {
      [P.qna.question]: { title: {} },
      [P.qna.answer]: { rich_text: {} },
      [P.qna.order]: { number: { format: 'number' } },
      [P.qna.published]: { checkbox: {} },
    },
  },
  settings: {
    key: 'settings',
    label: '사이트 설정',
    envKey: 'NOTION_SETTINGS_DATA_SOURCE_ID',
    table: siteSettings,
    titleProperty: P.settings.key,
    schema: settingSchema,
    transform: (page) => ({
      record: {
        key: readText(page, P.settings.key),
        value: readText(page, P.settings.value, { optional: true }),
      },
      image: null,
      sortOrder: orderOf(page, P.settings.order),
      published: readCheckbox(page, P.settings.published),
    }),
    notionProperties: {
      [P.settings.key]: { title: {} },
      [P.settings.value]: { rich_text: {} },
      [P.settings.description]: { rich_text: {} },
      [P.settings.order]: { number: { format: 'number' } },
      [P.settings.published]: { checkbox: {} },
    },
  },
} satisfies Record<CollectionKey, CollectionDef>;

export const COLLECTION_ORDER: CollectionKey[] = ['settings', 'qna', 'members', 'awards', 'projects'];
