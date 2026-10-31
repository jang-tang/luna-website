import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CollectionKey } from '@/services/cache/tags';
import type { Database } from '@/services/database/client';
import { selectAwardYears, selectMemberGroups, selectQnas } from '@/services/database/queries';
import { awards, media, memberGroups, members, qnas, syncRuns, syncState } from '@/services/database/schema';
import { NotionClient } from '@/services/notion/client';
import { runSync, type SyncDeps } from '@/services/notion/sync';
import { FakeNotion, P } from '../helpers/fake-notion';
import { setupTestDb } from '../helpers/test-db';

const MEMBERS = 'ds-members';
const AWARDS = 'ds-awards';
const QNA = 'ds-qna';

let env: Awaited<ReturnType<typeof setupTestDb>>;
let db: Database;
let notion: FakeNotion;
let invalidated: CollectionKey[][];

// 실제 DIMIGO LUNA 'Members' DB 구조 (order/published 는 선택 속성)
const member = (name: string, gen: string, order: number, extra: Record<string, ReturnType<typeof P.title>> = {}) => ({
  name: P.title(name),
  lunaGeneration: P.select(gen),
  generation: P.select('22기'),
  class: P.select('해킹방어과'),
  position: P.select('Developer'),
  description: P.text(`${name} 소개`, 'desc'),
  image: P.file(`m-${name}`),
  order: P.number(order),
  published: P.check(true),
  ...extra,
});

const award = (name: string, year: string | null, extra: Record<string, ReturnType<typeof P.title>> = {}) => ({
  name: P.title(name),
  year: P.select(year),
  prize: P.text('금상'),
  team: P.text('STARE'),
  members: P.multi(['서승표', '정준영']),
  date: P.date('2023-10-28'),
  image: P.file(`a-${name}`),
  ...extra,
});

const qna = (question: string, answer: string, order: number) => ({ question: P.title(question), answer: P.text(answer, 'ans'), order: P.number(order) });

function deps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    db,
    notion: new NotionClient({ token: 'ntn_fake_token_for_tests', fetchImpl: notion.fetch, sleep: async () => {}, requestsPerSecond: 1000, maxRetries: 1 }),
    dataSourceIds: { members: MEMBERS, awards: AWARDS, qna: QNA },
    fetchImpl: notion.fetch,
    // 가짜 이미지 호스트는 공인 IP(문서용 대역)로 풀린다고 가정
    lookupImpl: (async () => [{ address: '93.184.216.34', family: 4 }]) as unknown as SyncDeps['lookupImpl'],
    onInvalidate: (changed) => void invalidated.push(changed),
    ...overrides,
  };
}

const sync = (mode: 'auto' | 'full' = 'auto', overrides: Partial<SyncDeps> = {}) => runSync(deps(overrides), { trigger: 'test', mode });

async function resetDb() {
  await db.execute(sql`truncate members, awards, projects, qnas, site_settings, member_groups, sync_state, sync_runs, sync_locks, media restart identity cascade`);
}

beforeAll(async () => {
  env = await setupTestDb();
  db = env.db;
});

afterAll(async () => {
  await env.teardown();
});

beforeEach(async () => {
  await resetDb();
  invalidated = [];
  notion = new FakeNotion();
  notion.addDataSource(MEMBERS, {
    lunaGeneration: { id: 'sel', name: 'lunaGeneration', type: 'select', select: { options: [{ id: '1', name: 'LUNA 7기' }, { id: '2', name: 'LUNA 6기' }, { id: '3', name: '명예 멤버' }] } },
  });
  notion.addDataSource(AWARDS);
  notion.addDataSource(QNA);
});

describe('Notion → DB 동기화', () => {
  it('초기 동기화: 페이지네이션된 모든 페이지를 가져와 저장하고 이미지/탭 순서/커서를 기록한다', async () => {
    // 명예 멤버를 먼저 만들어도 탭 순서는 최신 기수 → … → 명예 멤버
    notion.addPage(MEMBERS, member('강인영', '명예 멤버', 100));
    for (let i = 0; i < 5; i++) notion.addPage(MEMBERS, member(`7기${i}`, 'LUNA 7기', i));
    notion.addPage(MEMBERS, member('박성민', 'LUNA 6기', 10));
    notion.addPage(AWARDS, award('해커톤', '2023'));
    notion.addPage(QNA, qna('루나는?', 'IT 소셜벤처\n동아리', 1));

    const result = await sync();
    expect(result.status).toBe('success');
    expect(result.stats.members).toMatchObject({ mode: 'full', added: 7, updated: 0, deleted: 0, failed: 0 });
    expect(result.stats.awards?.added).toBe(1);
    expect(result.stats.qna?.added).toBe(1);
    expect(invalidated).toEqual([['qna', 'members', 'awards']]);

    const groups = await selectMemberGroups(db);
    expect(groups.map((g) => g.name)).toEqual(['LUNA 7기', 'LUNA 6기', '명예 멤버']);
    expect(groups[0]!.members.map((m) => m.name)).toEqual(['7기0', '7기1', '7기2', '7기3', '7기4']);
    expect(groups[0]!.members[0]!.image).toMatch(/^\/media\/[0-9a-f]{32}\.webp$/);

    const [firstAward] = (await selectAwardYears(db))[0]!.awards;
    expect(firstAward).toMatchObject({ name: '해커톤', prize: '금상', team: 'STARE', members: '서승표,정준영', date: '2023년 10월 28일 하루동안' });
    expect((await selectQnas(db))[0]!.answer).toBe('IT 소셜벤처\n동아리');

    const state = await db.select().from(syncState).where(eq(syncState.collection, 'members'));
    expect(state[0]!.cursor).toBeInstanceOf(Date);
    expect(state[0]!.lastFullSyncAt).toBeInstanceOf(Date);
    expect(notion.imageDownloads).toBe(8);
  });

  it('변경이 없으면 쓰기·이미지 다운로드·캐시 무효화를 하지 않는다 (증분)', async () => {
    notion.addPage(MEMBERS, member('서승표', 'LUNA 7기', 1));
    await sync();
    const downloads = notion.imageDownloads;
    const before = await db.select({ updatedAt: members.updatedAt }).from(members);
    invalidated = [];

    const result = await sync();
    expect(result.stats.members).toMatchObject({ mode: 'incremental', added: 0, updated: 0, unchanged: 1 });
    expect(notion.imageDownloads).toBe(downloads);
    expect(invalidated).toEqual([]);
    const after = await db.select({ updatedAt: members.updatedAt }).from(members);
    expect(after[0]!.updatedAt.getTime()).toBe(before[0]!.updatedAt.getTime());
  });

  it('수정·비공개·삭제(휴지통)·복구를 반영한다', async () => {
    const a = notion.addPage(MEMBERS, member('A', 'LUNA 7기', 1));
    const b = notion.addPage(MEMBERS, member('B', 'LUNA 7기', 2));
    const c = notion.addPage(MEMBERS, member('C', 'LUNA 7기', 3));
    await sync();

    notion.updatePage(MEMBERS, a, { description: P.text('바뀐 소개', 'desc') });
    notion.updatePage(MEMBERS, b, { published: P.check(false) });
    notion.trashPage(MEMBERS, c);
    let result = await sync();
    expect(result.stats.members).toMatchObject({ updated: 1, hidden: 1, deleted: 1 });

    let names = (await selectMemberGroups(db))[0]!.members.map((m) => `${m.name}:${m.description}`);
    expect(names).toEqual(['A:바뀐 소개']);
    const rowC = await db.select().from(members).where(eq(members.notionPageId, c));
    expect(rowC[0]).toMatchObject({ status: 'deleted' });
    expect(rowC[0]!.deletedAt).toBeInstanceOf(Date);

    // 휴지통에서 복구 (Notion 은 복구 시 last_edited_time 이 바뀌지 않을 수 있다 → 목록 비교로 감지)
    notion.trashPage(MEMBERS, c, false);
    notion.updatePage(MEMBERS, b, { published: P.check(true) });
    result = await sync();
    expect(result.stats.members?.restored).toBe(1);
    names = (await selectMemberGroups(db))[0]!.members.map((m) => m.name);
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('같은 분(minute) 안에서 다시 수정돼도 콘텐츠 해시로 변경을 감지한다', async () => {
    const id = notion.addPage(QNA, qna('Q1', 'A1', 1));
    await sync();
    // last_edited_time 은 분 단위라 같은 값일 수 있음 → 커서 여유(2분)로 다시 조회되고 해시로 변경 판정
    notion.updatePage(QNA, id, { answer: P.text('A2', 'ans') });
    const result = await sync();
    expect(result.stats.qna?.updated).toBe(1);
    expect((await selectQnas(db))[0]!.answer).toBe('A2');
  });

  it('잘못된 페이지(필수값 누락)는 건너뛰고 나머지는 반영하며 오류를 기록한다', async () => {
    notion.addPage(AWARDS, award('', '2023'));
    notion.addPage(AWARDS, award('정상', '1800'));
    notion.addPage(AWARDS, award('OK', '2022'));
    const result = await sync();
    expect(result.status).toBe('partial');
    expect(result.stats.awards).toMatchObject({ added: 1, failed: 2 });
    expect(result.errors.filter((e) => e.collection === 'awards')).toHaveLength(2);
    const runs = await db.select().from(syncRuns);
    expect(runs.at(-1)!.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('Notion 장애 시 해당 컬렉션은 실패 처리하고 기존 DB 데이터와 커서를 유지한다', async () => {
    notion.addPage(MEMBERS, member('A', 'LUNA 7기', 1));
    notion.addPage(QNA, qna('Q', 'A', 1));
    await sync();
    const cursorBefore = (await db.select().from(syncState).where(eq(syncState.collection, 'members')))[0]!.cursor;

    notion.failingQueries.add(MEMBERS);
    notion.updatePage(QNA, [...notion.stores.get(QNA)!.pages.keys()][0]!, { answer: P.text('새 답변', 'ans') });
    const result = await sync();
    expect(result.status).toBe('partial');
    expect(result.errors.some((e) => e.collection === 'members')).toBe(true);
    expect(result.stats.qna?.updated).toBe(1);
    // 멤버 데이터는 그대로 화면에 제공된다
    expect((await selectMemberGroups(db))[0]!.members.map((m) => m.name)).toEqual(['A']);
    const state = (await db.select().from(syncState).where(eq(syncState.collection, 'members')))[0]!;
    expect(state.cursor!.getTime()).toBe(cursorBefore!.getTime());
    expect(state.lastError).toContain('500');

    // 모든 컬렉션이 실패하면 failed
    notion.failingQueries.add(AWARDS);
    notion.failingQueries.add(QNA);
    expect((await sync()).status).toBe('failed');
  });

  it('Notion 에서 0건이 조회되면(권한 해제 의심) 대량 삭제를 보류한다', async () => {
    notion.addPage(MEMBERS, member('A', 'LUNA 7기', 1));
    notion.addPage(MEMBERS, member('B', 'LUNA 7기', 2));
    await sync();
    notion.removeAll(MEMBERS);
    const result = await sync();
    expect(result.stats.members?.deleted).toBe(0);
    expect(result.errors.some((e) => e.message.includes('대량 삭제를 보류'))).toBe(true);
    expect((await selectMemberGroups(db))[0]!.members).toHaveLength(2);
  });

  it('이미지 다운로드 실패 시 기존 이미지를 유지하고 다음 실행에서 재시도한다', async () => {
    const id = notion.addPage(MEMBERS, member('A', 'LUNA 7기', 1));
    await sync();
    const imageBefore = (await db.select().from(members))[0]!.imageId;

    notion.updatePage(MEMBERS, id, { image: P.file('m-new') });
    notion.failingImages.add('m-new');
    let result = await sync();
    expect(result.status).toBe('partial');
    let row = (await db.select().from(members))[0]!;
    expect(row.imageId).toBe(imageBefore);
    expect(row.contentHash).toBeNull();

    notion.failingImages.clear();
    result = await sync();
    expect(result.status).toBe('success');
    row = (await db.select().from(members))[0]!;
    expect(row.imageId).not.toBe(imageBefore);
    expect(row.imageSourceKey).toContain('m-new');
  });

  it('변환할 수 없는 사진(HEIC 등)은 한 번만 시도하고, 사진을 바꾸기 전까지 다시 받지 않는다', async () => {
    notion.brokenImages.add('m-heic');
    const id = notion.addPage(MEMBERS, { ...member('사진불가', 'LUNA 7기', 1), image: P.file('m-heic') });
    let result = await sync();
    expect(result.status).toBe('partial');
    expect(result.errors.some((e) => e.message.includes('unsupported image format'))).toBe(true);
    let row = (await db.select().from(members))[0]!;
    expect(row.imageId).toBeNull();
    expect(row.contentHash).not.toBeNull();
    const downloads = notion.imageDownloads;

    invalidated = [];
    result = await sync();
    expect(result.status).toBe('success');
    expect(result.stats.members).toMatchObject({ updated: 0, unchanged: 1 });
    expect(notion.imageDownloads).toBe(downloads);
    expect(invalidated).toEqual([]);

    // 노션에서 정상 사진으로 바꾸면 다시 처리된다
    notion.updatePage(MEMBERS, id, { image: P.file('m-fixed') });
    result = await sync();
    row = (await db.select().from(members))[0]!;
    expect(row.imageId).not.toBeNull();
  });

  it('동시에 실행하면 하나만 수행되고 나머지는 skipped (중복 실행 방지)', async () => {
    for (let i = 0; i < 4; i++) notion.addPage(MEMBERS, member(`M${i}`, 'LUNA 7기', i));
    const [a, b] = await Promise.all([sync(), sync()]);
    expect([a.status, b.status].sort()).toEqual(['skipped', 'success']);
    expect(await db.$count(members)).toBe(4);
    const runs = await db.select({ status: syncRuns.status }).from(syncRuns);
    expect(runs.map((r) => r.status).sort()).toEqual(['skipped', 'success']);
  });

  it('로컬 시드 행은 첫 Notion 동기화에서 정리되고, 연결되지 않은 컬렉션은 건드리지 않는다', async () => {
    await db.insert(members).values({ notionPageId: 'seed:members:1', name: '시드', generation: 'LUNA 1기' });
    await db.insert(awards).values({ notionPageId: 'seed:awards:1', name: '시드 대회', year: 2017 });
    notion.addPage(MEMBERS, member('노션', 'LUNA 7기', 1));
    await sync('auto', { dataSourceIds: { members: MEMBERS } });
    expect((await selectMemberGroups(db)).flatMap((g) => g.members.map((m) => m.name))).toEqual(['노션']);
    expect((await selectAwardYears(db))[0]!.awards[0]!.name).toBe('시드 대회');
  });

  it('25조각 이상으로 잘린 텍스트는 property item API 로 전체를 받아온다', async () => {
    const parts = Array.from({ length: 25 }, (_, i) => `p${i},`);
    const id = notion.addPage(QNA, { ...qna('긴 답변', '', 1), answer: P.textParts(parts, 'ans') });
    notion.setFullPropertyItems(id, 'ans', [...parts, 'TAIL']);
    await sync();
    expect((await selectQnas(db))[0]!.answer.endsWith('TAIL')).toBe(true);
  });

  it('참조가 끊긴 지 하루 지난 이미지는 정리된다', async () => {
    const id = notion.addPage(MEMBERS, member('A', 'LUNA 7기', 1));
    await sync();
    notion.updatePage(MEMBERS, id, { image: P.noFile() });
    await sync();
    expect(await db.$count(media)).toBe(1);
    await db.update(media).set({ createdAt: sql`now() - interval '2 days'` });
    await sync('full');
    expect(await db.$count(media)).toBe(0);
  });

  it('memberGroups 는 Notion 옵션 순서를 저장하고 qnas 는 정렬 순서를 따른다', async () => {
    notion.addPage(QNA, qna('두번째', '', 2));
    notion.addPage(QNA, qna('첫번째', '', 1));
    await sync();
    expect((await selectQnas(db)).map((q) => q.question)).toEqual(['첫번째', '두번째']);
    expect((await db.select().from(memberGroups)).map((g) => g.name)).toEqual(['LUNA 7기', 'LUNA 6기', '명예 멤버']);
    expect(await db.$count(qnas)).toBe(2);
  });

  it('실제 DB 구조: 기수 탭은 최신 기수부터, 소속은 "기수 학과", 업적은 연도(선택) 안에서 최신 날짜순·날짜 문구 변환', async () => {
    notion.addPage(MEMBERS, member('구성원A', 'LUNA 7기', 1));
    notion.addPage(MEMBERS, { ...member('신입', 'LUNA 9기', 1), order: P.number(null) });
    notion.addPage(MEMBERS, member('명예', '명예 멤버', 1));
    notion.addPage(MEMBERS, member('팔기', 'LUNA 8기', 1));
    // 순서·공개 속성이 없는 행도 기본 공개로 반영
    const noOptional: Record<string, unknown> = member('무순서', 'LUNA 7기', 0);
    delete noOptional.order;
    delete noOptional.published;
    notion.addPage(MEMBERS, noOptional as ReturnType<typeof member>);
    notion.addPage(AWARDS, award('여름 대회', '2025', { date: P.date('2025-07-18') }));
    notion.addPage(AWARDS, award('겨울 대회', '2025', { date: P.date('2025-12-01', '2025-12-02') }));
    notion.addPage(AWARDS, award('긴 대회', '2026', { date: P.date('2026-01-14', '2026-01-18') }));
    await sync();

    const groups = await selectMemberGroups(db);
    expect(groups.map((g) => g.name)).toEqual(['LUNA 9기', 'LUNA 8기', 'LUNA 7기', '명예 멤버']);
    expect(groups[2]!.members.map((m) => m.name)).toEqual(['구성원A', '무순서']);
    expect(groups[2]!.members[0]!.className).toBe('22기 해킹방어과');

    const years = await selectAwardYears(db);
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years[1]!.awards.map((a) => [a.name, a.date])).toEqual([
      ['겨울 대회', '2025년 12월 01일부터 이틀동안'],
      ['여름 대회', '2025년 07월 18일 하루동안'],
    ]);
    expect(years[0]!.awards[0]!.date).toBe('2026년 01월 14일부터 닷새동안');
  });
});
