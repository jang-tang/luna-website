/**
 * 원본 하드코딩 콘텐츠를 DB 에 넣는다 (Notion 연결 전 로컬 개발/테스트/첫 배포용).
 *   npm run db:seed            # Notion 데이터가 없는 컬렉션만 시드
 *
 * - notion_page_id 는 'seed:<collection>:<순번>' 이며, 해당 컬렉션의 첫 Notion 동기화에서 자동으로 정리된다.
 * - 이미 Notion 에서 동기화된 행이 있는 컬렉션은 건드리지 않는다 (운영 데이터 보호).
 * - 여러 번 실행해도 같은 결과 (upsert).
 */
import './lib/env';
import fs from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '../src/services/database/client';
import { awards, media, memberGroups, members, projects, qnas, siteSettings } from '../src/services/database/schema';
import { IMAGE_VARIANTS, type ImageVariant } from '../src/services/notion/collections';
import { processImage } from '../src/services/notion/images';
import { logger } from '../src/lib/logger';
import { loadLegacyContent } from './lib/legacy-content';

type Db = ReturnType<typeof getDb>;

async function hasNotionRows(db: Db, table: typeof members | typeof awards | typeof projects | typeof qnas | typeof siteSettings) {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(sql`${table.notionPageId} not like 'seed:%'`);
  return (rows[0]?.n ?? 0) > 0;
}

async function storeImage(db: Db, file: string | null, variant: ImageVariant): Promise<{ imageId: string | null; imageSourceKey: string | null }> {
  if (!file) return { imageId: null, imageSourceKey: null };
  const image = await processImage(fs.readFileSync(file), variant);
  const sourceKey = `seed:${file.split('/content/seed/')[1]}`;
  await db
    .insert(media)
    .values({ id: image.id, sourceKey, contentType: image.contentType, width: image.width, height: image.height, byteSize: image.data.length, data: image.data })
    .onConflictDoNothing();
  return { imageId: image.id, imageSourceKey: sourceKey };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsert(db: Db, table: any, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const set = Object.fromEntries(Object.keys(rows[0]!).filter((k) => k !== 'notionPageId').map((k) => [k, sql.raw(`excluded."${table[k].name}"`)]));
  await db.insert(table).values(rows).onConflictDoUpdate({ target: table.notionPageId, set });
}

async function main() {
  const db = getDb();
  const content = await loadLegacyContent();
  const base = (collection: string, order: number) => ({ notionPageId: `seed:${collection}:${order}`, sortOrder: order, status: 'published' as const, deletedAt: null, updatedAt: new Date() });

  if (!(await hasNotionRows(db, members))) {
    const rows = [];
    for (const m of content.members) rows.push({ ...base('members', m.order), name: m.name, generation: m.generation, position: m.position, className: m.className, description: m.description, ...(await storeImage(db, m.imagePath, IMAGE_VARIANTS.members)) });
    await upsert(db, members, rows);
    await db.delete(memberGroups);
    await db.insert(memberGroups).values(content.generations.map((name, i) => ({ name, sortOrder: i })));
    logger.info('seed.members', { count: rows.length });
  } else logger.info('seed.skip', { collection: 'members', reason: 'notion rows exist' });

  if (!(await hasNotionRows(db, awards))) {
    const rows = [];
    for (const a of content.awards) rows.push({ ...base('awards', a.order), year: a.year, name: a.name, prize: a.prize, team: a.team, members: a.members, dateText: a.dateText, ...(await storeImage(db, a.imagePath, IMAGE_VARIANTS.awards)) });
    await upsert(db, awards, rows);
    logger.info('seed.awards', { count: rows.length });
  } else logger.info('seed.skip', { collection: 'awards', reason: 'notion rows exist' });

  if (!(await hasNotionRows(db, projects))) {
    const rows = [];
    for (const p of content.projects) rows.push({ ...base('projects', p.order), year: p.year, name: p.name, description: p.description, awards: p.awards, ...(await storeImage(db, p.imagePath, IMAGE_VARIANTS.projects)) });
    await upsert(db, projects, rows);
    logger.info('seed.projects', { count: rows.length });
  } else logger.info('seed.skip', { collection: 'projects', reason: 'notion rows exist' });

  if (!(await hasNotionRows(db, qnas))) {
    await upsert(db, qnas, content.qnas.map((q) => ({ ...base('qna', q.order), question: q.question, answer: q.answer })));
    logger.info('seed.qna', { count: content.qnas.length });
  } else logger.info('seed.skip', { collection: 'qna', reason: 'notion rows exist' });

  if (!(await hasNotionRows(db, siteSettings))) {
    await upsert(db, siteSettings, content.settings.map((s) => ({ ...base('settings', s.order), key: s.key, value: s.value })));
    logger.info('seed.settings', { count: content.settings.length });
  } else logger.info('seed.skip', { collection: 'settings', reason: 'notion rows exist' });
}

main()
  .catch((err) => {
    logger.error('seed.failed', { err });
    process.exitCode = 1;
  })
  .finally(() => closeDb());
