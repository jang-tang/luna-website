import { z } from 'zod';
import type { NotionEnv } from '@/config/env';
import type { CollectionKey } from '@/services/cache/tags';
import { awards, members, projects, qnas, siteSettings } from '@/services/database/schema';
import { readCheckbox, readDate, readFirstFile, readList, readNumber, readText, type DateRange, type FileRef } from './properties';
import type { NotionPage } from './types';

/**
 * Notion 데이터 소스 ↔ DB 테이블 매핑 정의.
 * 새 콘텐츠 영역을 추가할 때는 이 파일에 정의를 하나 추가하고 테이블/마이그레이션/쿼리를 만들면 된다.
 *
 * 속성 이름은 DIMIGO LUNA 워크스페이스의 실제 데이터베이스(Members / Awards / Projects / FAQ)를 따른다.
 * 이름을 바꾸려면 PROPS 만 수정하면 된다.
 * - order(순서), published(공개) 는 실제 DB 에 없는 선택 속성이다. 없으면 기본 정렬 / 전체 공개로 처리하고,
 *   운영자가 같은 이름의 number / checkbox 속성을 추가하면 그대로 반영된다.
 * - 사이트 설정(settings)은 실제 워크스페이스에 대응 DB 가 없어 별도 'LUNA 사이트 설정' DB(한국어 속성)를 쓴다.
 */

export const PROPS = {
  members: {
    name: 'name',
    group: 'lunaGeneration', // 탭: LUNA 9기, LUNA 8기 …, 명예 멤버
    cohort: 'generation', // 학교 기수: 25기
    department: 'class', // 학과: 웹프로그래밍과
    position: 'position',
    description: 'description',
    image: 'image',
    order: 'order',
    published: 'published',
  },
  awards: {
    name: 'name',
    year: 'year',
    prize: 'prize',
    team: 'team',
    members: 'members',
    date: 'date',
    prizeMoney: 'prizemoney',
    image: 'image',
    order: 'order',
    published: 'published',
  },
  projects: { name: 'name', year: 'year', description: 'description', awards: 'awards', image: 'image', order: 'order', published: 'published' },
  qna: { question: 'question', answer: 'answer', order: 'order', published: 'published' },
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
};

// 순서 값이 없는 행은 순서가 있는 행 뒤에 오고, 그 안에서는 이름순(쿼리에서 처리)
const UNORDERED = Number.MAX_SAFE_INTEGER / 2;
const orderOf = (page: NotionPage, name: string) => readNumber(page, name) ?? UNORDERED;

const DAY_WORDS = ['', '하루', '이틀', '사흘', '나흘', '닷새', '엿새', '이레', '여드레', '아흐레', '열흘'];
const DAY_MS = 86_400_000;

/** 원본 화면의 날짜 문구: "2024년 01월 20일 하루동안", "2017년 11월 12일부터 이틀동안" */
export function formatAwardDate(range: DateRange | null): string {
  if (!range) return '';
  const [y, m, d] = range.start.split('-');
  const head = `${y}년 ${m}월 ${d}일`;
  const days = range.end ? Math.round((Date.parse(range.end) - Date.parse(range.start)) / DAY_MS) + 1 : 1;
  if (days <= 1) return `${head} 하루동안`;
  return `${head}부터 ${DAY_WORDS[days] ?? `${days}일`}동안`;
}

/** 업적은 같은 연도 안에서 최신 날짜가 먼저 (원본 데이터의 나열 순서와 동일) */
function awardOrder(page: NotionPage, date: DateRange | null): number {
  const explicit = readNumber(page, PROPS.awards.order);
  if (explicit !== null) return explicit;
  return date ? -Math.floor(Date.parse(date.start) / DAY_MS) : UNORDERED;
}

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
        generation: readText(page, P.members.group),
        position: readText(page, P.members.position, { optional: true }),
        // 원본 표기: "22기 해킹방어과"
        className: [readText(page, P.members.cohort, { optional: true }), readText(page, P.members.department, { optional: true })].filter(Boolean).join(' '),
        description: readText(page, P.members.description, { optional: true }),
      },
      image: readFirstFile(page, P.members.image),
      sortOrder: orderOf(page, P.members.order),
      published: readCheckbox(page, P.members.published),
    }),
  },
  awards: {
    key: 'awards',
    label: '업적',
    envKey: 'NOTION_AWARDS_DATA_SOURCE_ID',
    table: awards,
    titleProperty: P.awards.name,
    schema: awardSchema,
    imageVariant: IMAGE_VARIANTS.awards,
    transform: (page) => {
      const date = readDate(page, P.awards.date);
      return {
        record: {
          year: readNumber(page, P.awards.year),
          name: readText(page, P.awards.name),
          prize: readText(page, P.awards.prize, { optional: true }),
          team: readText(page, P.awards.team, { optional: true }),
          members: readText(page, P.awards.members, { optional: true }),
          dateText: formatAwardDate(date),
        },
        image: readFirstFile(page, P.awards.image),
        sortOrder: awardOrder(page, date),
        published: readCheckbox(page, P.awards.published),
      };
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
        awards: readList(page, P.projects.awards),
      },
      image: readFirstFile(page, P.projects.image),
      sortOrder: orderOf(page, P.projects.order),
      published: readCheckbox(page, P.projects.published),
    }),
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
  },
} satisfies Record<CollectionKey, CollectionDef>;

export const COLLECTION_ORDER: CollectionKey[] = ['settings', 'qna', 'members', 'awards', 'projects'];
