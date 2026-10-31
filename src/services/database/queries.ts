import { asc, eq } from 'drizzle-orm';
import type { AwardYear, MemberGroup, ProjectYear, QnaItem } from '@/services/content/types';
import type { Database } from './client';
import { awards, memberGroups, members, projects, qnas, siteSettings } from './schema';

/**
 * 화면 렌더링용 읽기 쿼리. 각 페이지는 필요한 컬럼만, 한 번의 쿼리(멤버는 2회)로 조회한다.
 * 결과는 UI 가 기대하는 View Model 로 변환해 반환한다 (N+1 없음).
 */

export const mediaUrl = (id: string | null) => (id ? `/media/${id}.webp` : null);

export async function selectMemberGroups(db: Database): Promise<MemberGroup[]> {
  const [rows, groups] = await Promise.all([
    db
      .select({
        id: members.id,
        name: members.name,
        generation: members.generation,
        position: members.position,
        className: members.className,
        description: members.description,
        imageId: members.imageId,
      })
      .from(members)
      .where(eq(members.status, 'published'))
      .orderBy(asc(members.sortOrder), asc(members.name), asc(members.id)),
    db.select({ name: memberGroups.name, sortOrder: memberGroups.sortOrder }).from(memberGroups),
  ]);

  // 탭 순서: "LUNA N기" 는 숫자가 큰 순서(최신 기수 먼저) → 그 외(명예 멤버 등)는 Notion 선택지 순서 → 처음 등장한 순서
  const optionOrder = new Map(groups.map((g) => [g.name, g.sortOrder]));
  const byGroup = new Map<string, MemberGroup>();
  const firstSeen = new Map<string, number>();
  rows.forEach((row, i) => {
    let group = byGroup.get(row.generation);
    if (!group) {
      group = { name: row.generation, members: [] };
      byGroup.set(row.generation, group);
      firstSeen.set(row.generation, i);
    }
    group.members.push({
      key: String(row.id),
      name: row.name,
      position: row.position,
      className: row.className,
      description: row.description,
      image: mediaUrl(row.imageId),
    });
  });
  const rank = (name: string) => {
    const generation = /(\d+)\s*기/.exec(name);
    if (generation) return -Number(generation[1]);
    return 1_000_000 + (optionOrder.get(name) ?? 1_000_000);
  };
  return [...byGroup.values()].sort((a, b) => rank(a.name) - rank(b.name) || firstSeen.get(a.name)! - firstSeen.get(b.name)!);
}

/** 연도 내림차순(원본: Object.keys().sort().reverse()) + 연도 내 정렬 순서 */
function groupByYear<R extends { year: number }, C>(rows: R[], toCard: (r: R) => C) {
  const map = new Map<number, C[]>();
  for (const row of rows) {
    const list = map.get(row.year) ?? [];
    list.push(toCard(row));
    map.set(row.year, list);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

export async function selectAwardYears(db: Database): Promise<AwardYear[]> {
  const rows = await db
    .select({
      id: awards.id,
      year: awards.year,
      name: awards.name,
      prize: awards.prize,
      team: awards.team,
      members: awards.members,
      dateText: awards.dateText,
      imageId: awards.imageId,
    })
    .from(awards)
    .where(eq(awards.status, 'published'))
    .orderBy(asc(awards.sortOrder), asc(awards.name), asc(awards.id));
  return groupByYear(rows, (r) => ({
    key: String(r.id),
    name: r.name,
    prize: r.prize,
    team: r.team,
    members: r.members,
    date: r.dateText,
    image: mediaUrl(r.imageId),
  })).map(([year, list]) => ({ year, awards: list }));
}

export async function selectProjectYears(db: Database): Promise<ProjectYear[]> {
  const rows = await db
    .select({ id: projects.id, year: projects.year, name: projects.name, description: projects.description, imageId: projects.imageId })
    .from(projects)
    .where(eq(projects.status, 'published'))
    .orderBy(asc(projects.sortOrder), asc(projects.name), asc(projects.id));
  return groupByYear(rows, (r) => ({ key: String(r.id), name: r.name, description: r.description, image: mediaUrl(r.imageId) })).map(
    ([year, list]) => ({ year, projects: list }),
  );
}

export async function selectQnas(db: Database): Promise<QnaItem[]> {
  const rows = await db
    .select({ id: qnas.id, question: qnas.question, answer: qnas.answer })
    .from(qnas)
    .where(eq(qnas.status, 'published'))
    .orderBy(asc(qnas.sortOrder), asc(qnas.question), asc(qnas.id));
  return rows.map((r) => ({ key: String(r.id), question: r.question, answer: r.answer }));
}

export async function selectSettingRows(db: Database) {
  return db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.status, 'published'))
    .orderBy(asc(siteSettings.sortOrder), asc(siteSettings.id));
}
