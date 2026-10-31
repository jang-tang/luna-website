/**
 * Notion 에 사이트용 데이터베이스 5개를 만들고 원본 콘텐츠(텍스트 + 이미지)를 옮긴다.
 *
 *   npm run notion:bootstrap -- --parent <페이지 ID 또는 URL> [--dry-run] [--write-env]
 *
 * - 부모 페이지는 통합(Integration)에 공유되어 있어야 한다.
 * - 진행 상황을 .notion-bootstrap.json 에 기록하므로, 중간에 실패해도 다시 실행하면 이어서 진행한다(중복 생성 없음).
 * - --write-env: 생성된 데이터 소스 ID 를 .env 에 기록한다 (기존 값은 덮어씀).
 * - 사용자 Notion 워크스페이스에 페이지를 생성하는 작업이므로 반드시 의도한 부모 페이지인지 확인 후 실행한다.
 */
import './lib/env';
import fs from 'node:fs';
import path from 'node:path';
import { getNotionEnv, normalizeNotionId } from '../src/config/env';
import { NotionClient } from '../src/services/notion/client';
import { COLLECTIONS, PROPS } from '../src/services/notion/collections';
import type { CollectionKey } from '../src/services/cache/tags';
import { loadLegacyContent } from './lib/legacy-content';

const STATE_FILE = path.join(process.cwd(), '.notion-bootstrap.json');
const DB_TITLES: Record<CollectionKey, string> = {
  members: 'LUNA 멤버',
  awards: 'LUNA 업적',
  projects: 'LUNA 프로젝트',
  qna: 'LUNA Q&A',
  settings: 'LUNA 사이트 설정',
};
const ORDER: CollectionKey[] = ['settings', 'qna', 'members', 'awards', 'projects'];

type State = { parent: string; databases: Partial<Record<CollectionKey, { databaseId: string; dataSourceId: string }>>; rows: Record<string, string> };

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes('--dry-run');

const rich = (value: string) => {
  // Notion rich text 조각은 2000자 제한
  const parts: Array<{ type: 'text'; text: { content: string } }> = [];
  for (let i = 0; i < value.length; i += 2000) parts.push({ type: 'text', text: { content: value.slice(i, i + 2000) } });
  return parts;
};
const title = (value: string) => ({ title: rich(value) });
const text = (value: string) => ({ rich_text: rich(value) });
const num = (value: number) => ({ number: value });
const select = (value: string) => ({ select: value ? { name: value } : null });
const checkbox = (value: boolean) => ({ checkbox: value });

function loadState(parent: string): State {
  if (fs.existsSync(STATE_FILE)) {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as State;
    if (s.parent !== parent) throw new Error(`.notion-bootstrap.json 은 다른 부모 페이지(${s.parent})용입니다. 파일을 확인하세요.`);
    return s;
  }
  return { parent, databases: {}, rows: {} };
}

const saveState = (s: State) => !dryRun && fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

async function upload(notion: NotionClient, file: string | null) {
  if (!file) return null;
  const name = path.basename(file);
  const contentType = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const created = await notion.createFileUpload(name, contentType);
  await notion.sendFileUpload(created.id, fs.readFileSync(file), name, contentType);
  return { files: [{ type: 'file_upload', file_upload: { id: created.id }, name }] };
}

async function main() {
  const env = getNotionEnv();
  const parentRaw = arg('--parent') ?? env.NOTION_ROOT_PAGE_ID;
  if (!parentRaw) throw new Error('--parent <페이지 ID/URL> 또는 NOTION_ROOT_PAGE_ID 가 필요합니다');
  const parent = normalizeNotionId(parentRaw);
  const notion = new NotionClient({ token: env.NOTION_TOKEN, requestsPerSecond: env.NOTION_REQUESTS_PER_SECOND });
  const content = await loadLegacyContent();
  const state = loadState(parent);

  const parentPage = await notion.retrievePage(parent);
  console.log(`부모 페이지: ${parentPage.url ?? parent}${dryRun ? '  (dry-run: 생성하지 않음)' : ''}`);

  // 1) 데이터베이스 생성
  for (const key of ORDER) {
    if (state.databases[key]) continue;
    const def = COLLECTIONS[key];
    const properties = structuredClone(def.notionProperties) as Record<string, { select?: { options: Array<{ name: string }> } }>;
    // 멤버 탭 순서 = '기수' 옵션 순서
    if (key === 'members') properties[PROPS.members.generation] = { select: { options: content.generations.map((name) => ({ name })) } };
    if (dryRun) {
      console.log(`[dry-run] 데이터베이스 생성: ${DB_TITLES[key]} (${Object.keys(properties).join(', ')})`);
      continue;
    }
    const db = await notion.createDatabase({
      parent: { type: 'page_id', page_id: parent },
      title: rich(DB_TITLES[key]),
      initial_data_source: { properties },
    });
    const dataSourceId = db.data_sources?.[0]?.id;
    if (!dataSourceId) throw new Error(`${DB_TITLES[key]}: 응답에 data source id 가 없습니다`);
    state.databases[key] = { databaseId: db.id, dataSourceId };
    saveState(state);
    console.log(`데이터베이스 생성: ${DB_TITLES[key]} → data source ${dataSourceId}`);
  }

  // 2) 행 생성
  const rows: Array<{ key: CollectionKey; id: string; label: string; build: () => Promise<Record<string, unknown>> }> = [
    ...content.settings.map((s) => ({
      key: 'settings' as const,
      id: `settings:${s.key}`,
      label: s.key,
      build: async () => ({ [PROPS.settings.key]: title(s.key), [PROPS.settings.value]: text(s.value), [PROPS.settings.description]: text(s.description), [PROPS.settings.order]: num(s.order), [PROPS.settings.published]: checkbox(true) }),
    })),
    ...content.qnas.map((q) => ({
      key: 'qna' as const,
      id: `qna:${q.order}`,
      label: q.question,
      build: async () => ({ [PROPS.qna.question]: title(q.question), [PROPS.qna.answer]: text(q.answer), [PROPS.qna.order]: num(q.order), [PROPS.qna.published]: checkbox(true) }),
    })),
    ...content.members.map((m) => ({
      key: 'members' as const,
      id: `members:${m.order}`,
      label: `${m.generation} ${m.name}`,
      build: async () => ({
        [PROPS.members.name]: title(m.name),
        [PROPS.members.generation]: select(m.generation),
        [PROPS.members.position]: select(m.position),
        [PROPS.members.className]: text(m.className),
        [PROPS.members.description]: text(m.description),
        [PROPS.members.order]: num(m.order),
        [PROPS.members.published]: checkbox(true),
        ...(m.imagePath ? { [PROPS.members.image]: await upload(notion, m.imagePath) } : {}),
      }),
    })),
    ...content.awards.map((a) => ({
      key: 'awards' as const,
      id: `awards:${a.order}`,
      label: `${a.year} ${a.name}`,
      build: async () => ({
        [PROPS.awards.name]: title(a.name),
        [PROPS.awards.year]: num(a.year),
        [PROPS.awards.prize]: text(a.prize),
        [PROPS.awards.team]: text(a.team),
        [PROPS.awards.members]: text(a.members),
        [PROPS.awards.date]: text(a.dateText),
        [PROPS.awards.order]: num(a.order),
        [PROPS.awards.published]: checkbox(true),
        ...(a.imagePath ? { [PROPS.awards.image]: await upload(notion, a.imagePath) } : {}),
      }),
    })),
    ...content.projects.map((p) => ({
      key: 'projects' as const,
      id: `projects:${p.order}`,
      label: `${p.year} ${p.name}`,
      build: async () => ({
        [PROPS.projects.name]: title(p.name),
        [PROPS.projects.year]: num(p.year),
        [PROPS.projects.description]: text(p.description),
        [PROPS.projects.awards]: text(p.awards.join('\n')),
        [PROPS.projects.order]: num(p.order),
        [PROPS.projects.published]: checkbox(true),
        ...(p.imagePath ? { [PROPS.projects.image]: await upload(notion, p.imagePath) } : {}),
      }),
    })),
  ];

  let created = 0;
  for (const row of rows) {
    if (state.rows[row.id]) continue;
    if (dryRun) {
      created++;
      continue;
    }
    const dataSourceId = state.databases[row.key]!.dataSourceId;
    const page = await notion.createPage({ parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties: await row.build() });
    state.rows[row.id] = page.id;
    saveState(state);
    created++;
    if (created % 10 === 0) console.log(`  ${created}/${rows.length} ... (${row.label})`);
  }
  console.log(`${dryRun ? '[dry-run] 생성 예정' : '생성 완료'}: 행 ${created}개 (전체 ${rows.length}, 이미지 ${rows.length - content.settings.length - content.qnas.length}건 중 파일 있는 것만 업로드)`);

  if (dryRun) return;
  const envLines = ORDER.map((key) => `${COLLECTIONS[key].envKey}=${state.databases[key]!.dataSourceId}`);
  console.log('\n.env 에 설정할 값:\n' + envLines.join('\n'));
  if (process.argv.includes('--write-env')) {
    const envPath = path.join(process.cwd(), '.env');
    let current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    for (const line of [`NOTION_ROOT_PAGE_ID=${parent}`, ...envLines]) {
      const k = line.split('=')[0]!;
      const re = new RegExp(`^${k}=.*$`, 'm');
      current = re.test(current) ? current.replace(re, line) : `${current.replace(/\n?$/, '\n')}${line}\n`;
    }
    fs.writeFileSync(envPath, current);
    console.log('.env 에 기록했습니다.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
