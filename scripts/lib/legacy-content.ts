/**
 * 원본 사이트의 하드코딩 데이터(content/seed/*.js, 기존 data/*.js)를 정규화된 레코드로 읽는다.
 * DB 시드(db:seed)와 Notion 부트스트랩(notion:bootstrap)이 같은 원본을 공유한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_SETTINGS, SETTING_DESCRIPTIONS, SETTING_KEYS } from '../../src/services/content/settings';

const ROOT = path.resolve(__dirname, '../../content/seed');

type MemberData = Record<string, Record<string, { description: string; position: string; class: string; image: string | null }>>;
type AwardData = Record<string, Record<string, { prize: string; team: string; members: string[]; date: string; image: string }>>;
type ProjectData = Record<string, Record<string, { description: string; image: string; awards: string[] }>>;
type QnaData = Record<string, string>;

async function load<T>(file: string): Promise<T> {
  const mod = (await import(pathToFileURL(path.join(ROOT, file)).href)) as { default: T };
  return mod.default;
}

const imagePath = (dir: string, file: string | null | undefined) => {
  if (!file) return null;
  const p = path.join(ROOT, 'images', dir, file);
  return fs.existsSync(p) ? p : null;
};

export type LegacyMember = { order: number; name: string; generation: string; position: string; className: string; description: string; imagePath: string | null };
export type LegacyAward = { order: number; year: number; name: string; prize: string; team: string; members: string; dateText: string; imagePath: string | null };
export type LegacyProject = { order: number; year: number; name: string; description: string; awards: string[]; imagePath: string | null };
export type LegacyQna = { order: number; question: string; answer: string };
export type LegacySetting = { order: number; key: string; value: string; description: string };

export async function loadLegacyContent() {
  const [memberData, awardData, projectData, qnaData] = await Promise.all([
    load<MemberData>('members.js'),
    load<AwardData>('award.js'),
    load<ProjectData>('project.js'),
    load<QnaData>('qna.js'),
  ]);

  const generations = Object.keys(memberData);
  const members: LegacyMember[] = [];
  for (const [generation, list] of Object.entries(memberData)) {
    for (const [name, m] of Object.entries(list)) {
      members.push({ order: members.length + 1, name, generation, position: m.position, className: m.class, description: m.description, imagePath: imagePath('member', m.image) });
    }
  }

  const awards: LegacyAward[] = [];
  for (const [year, list] of Object.entries(awardData)) {
    for (const [name, a] of Object.entries(list)) {
      // 원본 출력: `${data.team} - ${data.members}` → 배열은 쉼표로 결합된다
      awards.push({ order: awards.length + 1, year: Number(year), name, prize: a.prize, team: a.team, members: a.members.join(','), dateText: a.date, imagePath: imagePath('award', a.image) });
    }
  }

  const projects: LegacyProject[] = [];
  for (const [year, list] of Object.entries(projectData)) {
    for (const [name, p] of Object.entries(list)) {
      projects.push({ order: projects.length + 1, year: Number(year), name, description: p.description, awards: p.awards ?? [], imagePath: imagePath('project', p.image) });
    }
  }

  const qnas: LegacyQna[] = Object.entries(qnaData).map(([question, answer], i) => ({ order: i + 1, question, answer }));

  const settings: LegacySetting[] = [
    [SETTING_KEYS.projectCount, DEFAULT_SETTINGS.projectCount],
    [SETTING_KEYS.contestCount, DEFAULT_SETTINGS.contestCount],
    [SETTING_KEYS.prizeTotal, DEFAULT_SETTINGS.prizeTotal],
    [SETTING_KEYS.homeTags1, DEFAULT_SETTINGS.homeTags[0]!.join(', ')],
    [SETTING_KEYS.homeTags2, DEFAULT_SETTINGS.homeTags[1]!.join(', ')],
    [SETTING_KEYS.homeTags3, DEFAULT_SETTINGS.homeTags[2]!.join(', ')],
    [SETTING_KEYS.qnaVideoUrl, 'https://www.youtube.com/watch?v=hIX8CQHqW-M'],
  ].map(([key, value], i) => ({ order: i + 1, key: key!, value: value!, description: SETTING_DESCRIPTIONS[key!] ?? '' }));

  return { generations, members, awards, projects, qnas, settings };
}
