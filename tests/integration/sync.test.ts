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

const member = (name: string, gen: string, order: number, extra: Record<string, ReturnType<typeof P.title>> = {}) => ({
  이름: P.title(name),
  기수: P.select(gen),
  역할: P.select('Developer'),
  소속: P.text('22기 해킹방어과', 'cls'),
  소개: P.text(`${name} 소개`, 'desc'),
  사진: P.file(`m-${name}`),
  순서: P.number(order),
  공개: P.check(true),
  ...extra,
});

function deps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    db,
    notion: new NotionClient({ token: 'ntn_fake_token_for_tests', fetchImpl: notion.fetch, sleep: async () => {}, requestsPerSecond: 1000, maxRetries: 1 }),
    dataSourceIds: { members: MEMBERS, awards: AWARDS, qna: QNA },
    fetchImpl: notion.fetch,
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
    기수: { id: 'sel', name: '기수', type: 'select', select: { options: [{ id: '1', name: 'LUNA 7기' }, { id: '2', name: 'LUNA 6기' }, { id: '3', name: '명예 멤버' }] } },
  });
  notion.addDataSource(AWARDS);
  notion.addDataSource(QNA);
});

describe('Notion → DB 동기화', () => {
  it('초기 동기화: 페이지네이션된 모든 페이지를 가져와 저장하고 이미지/탭 순서/커서를 기록한다', async () => {
    // 명예 멤버를 먼저 만들어도 탭 순서는 Notion '기수' 옵션 순서를 따른다
    notion.addPage(MEMBERS, member('강인영', '명예 멤버', 100));
    for (let i = 0; i < 5; i++) notion.addPage(MEMBERS, member(`7기${i}`, 'LUNA 7기', i));
    notion.addPage(MEMBERS, member('박성민', 'LUNA 6기', 10));
    notion.addPage(AWARDS, { 대회명: P.title('해커톤'), 연도: P.number(2023), 수상: P.text('금상'), 팀: P.text('STARE'), 참여자: P.text('서승표,정준영'), 일자: P.text('2023년 10월 28일'), 사진: P.file('a-1'), 순서: P.number(1), 공개: P.check(true) });
    notion.addPage(QNA, { 질문: P.title('루나는?'), 답변: P.text('IT 소셜벤처\n동아리'), 순서: P.number(1), 공개: P.check(true) });

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

    const [award] = (await selectAwardYears(db))[0]!.awards;
    expect(award).toMatchObject({ name: '해커톤', prize: '금상', team: 'STARE', members: '서승표,정준영', date: '2023년 10월 28일' });
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

    notion.updatePage(MEMBERS, a, { 소개: P.text('바뀐 소개', 'desc') });
    notion.updatePage(MEMBERS, b, { 공개: P.check(false) });
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
    notion.updatePage(MEMBERS, b, { 공개: P.check(true) });
    result = await sync();
    expect(result.stats.members?.restored).toBe(1);
    names = (await selectMemberGroups(db))[0]!.members.map((m) => m.name);
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('같은 분(minute) 안에서 다시 수정돼도 콘텐츠 해시로 변경을 감지한다', async () => {
    const id = notion.addPage(QNA, { 질문: P.title('Q1'), 답변: P.text('A1'), 순서: P.number(1), 공개: P.check(true) });
    await sync();
    // last_edited_time 은 분 단위라 같은 값일 수 있음 → 커서 여유(2분)로 다시 조회되고 해시로 변경 판정
    notion.updatePage(QNA, id, { 답변: P.text('A2') });
    const result = await sync();
    expect(result.stats.qna?.updated).toBe(1);
    expect((await selectQnas(db))[0]!.answer).toBe('A2');
  });

  it('잘못된 페이지(필수값 누락)는 건너뛰고 나머지는 반영하며 오류를 기록한다', async () => {
    notion.addPage(AWARDS, { 대회명: P.title(''), 연도: P.number(2023), 순서: P.number(1), 공개: P.check(true) });
    notion.addPage(AWARDS, { 대회명: P.title('정상'), 연도: P.number(1800), 순서: P.number(2), 공개: P.check(true) });
    notion.addPage(AWARDS, { 대회명: P.title('OK'), 연도: P.number(2022), 순서: P.number(3), 공개: P.check(true) });
    const result = await sync();
    expect(result.status).toBe('partial');
    expect(result.stats.awards).toMatchObject({ added: 1, failed: 2 });
    expect(result.errors.filter((e) => e.collection === 'awards')).toHaveLength(2);
    const runs = await db.select().from(syncRuns);
    expect(runs.at(-1)!.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('Notion 장애 시 해당 컬렉션은 실패 처리하고 기존 DB 데이터와 커서를 유지한다', async () => {
    notion.addPage(MEMBERS, member('A', 'LUNA 7기', 1));
    notion.addPage(QNA, { 질문: P.title('Q'), 답변: P.text('A'), 순서: P.number(1), 공개: P.check(true) });
    await sync();
    const cursorBefore = (await db.select().from(syncState).where(eq(syncState.collection, 'members')))[0]!.cursor;

    notion.failingQueries.add(MEMBERS);
    notion.updatePage(QNA, [...notion.stores.get(QNA)!.pages.keys()][0]!, { 답변: P.text('새 답변') });
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

    notion.updatePage(MEMBERS, id, { 사진: P.file('m-new') });
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
    const id = notion.addPage(QNA, { 질문: P.title('긴 답변'), 답변: P.textParts(parts, 'ans'), 순서: P.number(1), 공개: P.check(true) });
    notion.setFullPropertyItems(id, 'ans', [...parts, 'TAIL']);
    await sync();
    expect((await selectQnas(db))[0]!.answer.endsWith('TAIL')).toBe(true);
  });

  it('참조가 끊긴 지 하루 지난 이미지는 정리된다', async () => {
    const id = notion.addPage(MEMBERS, member('A', 'LUNA 7기', 1));
    await sync();
    notion.updatePage(MEMBERS, id, { 사진: P.noFile() });
    await sync();
    expect(await db.$count(media)).toBe(1);
    await db.update(media).set({ createdAt: sql`now() - interval '2 days'` });
    await sync('full');
    expect(await db.$count(media)).toBe(0);
  });

  it('memberGroups 는 Notion 옵션 순서를 저장하고 qnas 는 정렬 순서를 따른다', async () => {
    notion.addPage(QNA, { 질문: P.title('두번째'), 답변: P.text(''), 순서: P.number(2), 공개: P.check(true) });
    notion.addPage(QNA, { 질문: P.title('첫번째'), 답변: P.text(''), 순서: P.number(1), 공개: P.check(true) });
    await sync();
    expect((await selectQnas(db)).map((q) => q.question)).toEqual(['첫번째', '두번째']);
    expect((await db.select().from(memberGroups)).map((g) => g.name)).toEqual(['LUNA 7기', 'LUNA 6기', '명예 멤버']);
    expect(await db.$count(qnas)).toBe(2);
  });
});
