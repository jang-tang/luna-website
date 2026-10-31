/**
 * 통합(Integration)이 접근 가능한 Notion 데이터 소스를 나열하고 환경변수 후보를 제안한다.
 *   npm run notion:discover
 */
import './lib/env';
import { getNotionEnv } from '../src/config/env';
import { NotionClient } from '../src/services/notion/client';
import { COLLECTIONS, PROPS } from '../src/services/notion/collections';

type DS = { id: string; title?: Array<{ plain_text: string }>; properties?: Record<string, { type: string }>; parent?: Record<string, unknown> };

async function main() {
  const env = getNotionEnv();
  const notion = new NotionClient({ token: env.NOTION_TOKEN });
  const found: DS[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.search({ filter: { property: 'object', value: 'data_source' }, startCursor: cursor });
    found.push(...(res.results as unknown as DS[]));
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`접근 가능한 데이터 소스: ${found.length}개\n`);
  for (const ds of found) {
    const title = ds.title?.map((t) => t.plain_text).join('') || '(제목 없음)';
    const props = Object.keys(ds.properties ?? {});
    // 속성 이름이 가장 많이 겹치는 컬렉션을 후보로 제안
    let best: { key: string; score: number } | null = null;
    for (const def of Object.values(COLLECTIONS)) {
      const expected = Object.values(PROPS[def.key]);
      const score = expected.filter((p) => props.includes(p)).length / expected.length;
      if (!best || score > best.score) best = { key: def.key, score };
    }
    const match = best && best.score >= 0.6 ? COLLECTIONS[best.key as keyof typeof COLLECTIONS].envKey : null;
    console.log(`- ${title}\n    id: ${ds.id}\n    속성: ${props.join(', ')}${match ? `\n    → ${match}=${ds.id}` : ''}\n`);
  }
  console.log('현재 설정:');
  for (const def of Object.values(COLLECTIONS)) console.log(`  ${def.envKey}=${env[def.envKey] ?? '(미설정)'}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
