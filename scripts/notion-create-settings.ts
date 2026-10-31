/**
 * Notion 에 '사이트 설정' 데이터베이스를 만들고 기본값 행을 채운다 (홈의 숫자·태그, Q&A 영상 등).
 *
 *   npm run notion:create-settings -- --parent <부모 페이지 ID 또는 URL> [--write-env]
 *
 * - 부모 페이지는 지금 쓰는 Notion 통합(토큰)에 연결되어 있어야 한다.
 * - --write-env: 만든 데이터 소스 ID 를 .env 의 NOTION_SETTINGS_DATA_SOURCE_ID 에 기록한다.
 * - 이미 접근 가능한 설정 데이터베이스가 연결되어 있으면 중복 생성을 막기 위해 중단한다.
 */
import './lib/env';
import fs from 'node:fs';
import path from 'node:path';
import { getNotionEnv, normalizeNotionId } from '../src/config/env';
import { DEFAULT_SETTINGS, SETTING_DESCRIPTIONS, SETTING_KEYS } from '../src/services/content/settings';
import { NotionClient } from '../src/services/notion/client';
import { PROPS } from '../src/services/notion/collections';

const P = PROPS.settings;
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const text = (value: string) => [{ type: 'text', text: { content: value } }];

const ROWS: Array<[string, string]> = [
  [SETTING_KEYS.projectCount, DEFAULT_SETTINGS.projectCount],
  [SETTING_KEYS.contestCount, DEFAULT_SETTINGS.contestCount],
  [SETTING_KEYS.prizeTotal, DEFAULT_SETTINGS.prizeTotal],
  [SETTING_KEYS.homeTags1, DEFAULT_SETTINGS.homeTags[0]!.join(', ')],
  [SETTING_KEYS.homeTags2, DEFAULT_SETTINGS.homeTags[1]!.join(', ')],
  [SETTING_KEYS.homeTags3, DEFAULT_SETTINGS.homeTags[2]!.join(', ')],
  [SETTING_KEYS.qnaVideoUrl, 'https://www.youtube.com/watch?v=hIX8CQHqW-M'],
];

async function main() {
  const env = getNotionEnv();
  const parentRaw = arg('--parent') ?? env.NOTION_ROOT_PAGE_ID;
  if (!parentRaw) throw new Error('--parent <페이지 ID/URL> 또는 NOTION_ROOT_PAGE_ID 가 필요합니다');
  const parent = normalizeNotionId(parentRaw);
  const notion = new NotionClient({ token: env.NOTION_TOKEN });

  if (env.NOTION_SETTINGS_DATA_SOURCE_ID) {
    const existing = await notion.retrieveDataSource(env.NOTION_SETTINGS_DATA_SOURCE_ID).catch(() => null);
    if (existing) throw new Error(`이미 설정 데이터베이스가 연결되어 있습니다 (${env.NOTION_SETTINGS_DATA_SOURCE_ID}). 새로 만들려면 .env 의 NOTION_SETTINGS_DATA_SOURCE_ID 를 비우세요.`);
  }

  const db = await notion.createDatabase({
    parent: { type: 'page_id', page_id: parent },
    title: text('LUNA 사이트 설정'),
    initial_data_source: {
      properties: {
        [P.key]: { title: {} },
        [P.value]: { rich_text: {} },
        [P.description]: { rich_text: {} },
        [P.order]: { number: { format: 'number' } },
        [P.published]: { checkbox: {} },
      },
    },
  });
  const dataSourceId = db.data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error('응답에 data source id 가 없습니다');

  for (const [i, [key, value]] of ROWS.entries()) {
    await notion.createPage({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: {
        [P.key]: { title: text(key) },
        [P.value]: { rich_text: text(value) },
        [P.description]: { rich_text: text(SETTING_DESCRIPTIONS[key] ?? '') },
        [P.order]: { number: i + 1 },
        [P.published]: { checkbox: true },
      },
    });
  }
  console.log(`'LUNA 사이트 설정' 생성 완료 (${ROWS.length}행): ${db.url ?? db.id}`);
  console.log(`NOTION_SETTINGS_DATA_SOURCE_ID=${dataSourceId}`);

  if (process.argv.includes('--write-env')) {
    const envPath = path.join(process.cwd(), '.env');
    const line = `NOTION_SETTINGS_DATA_SOURCE_ID=${dataSourceId}`;
    let current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    current = /^NOTION_SETTINGS_DATA_SOURCE_ID=.*$/m.test(current)
      ? current.replace(/^NOTION_SETTINGS_DATA_SOURCE_ID=.*$/m, line)
      : `${current.replace(/\n?$/, '\n')}${line}\n`;
    fs.writeFileSync(envPath, current);
    console.log('.env 에 기록했습니다.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
