import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { closeDb, getDb } from '@/services/database/client';
import { runMigrations } from '@/services/database/migrate';

/**
 * 테스트용 실제 PostgreSQL(PGlite) + 운영과 동일한 postgres.js 드라이버.
 * 테스트 파일마다 새 인메모리 DB 를 만들고 마이그레이션을 적용한다.
 */
export async function setupTestDb() {
  const db = await PGlite.create();
  const port = 55000 + Math.floor(Math.random() * 5000);
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_SSL = 'disable';
  process.env.DATABASE_PREPARE = 'false';
  process.env.DATABASE_POOL_MAX = '1';
  await runMigrations(path.join(process.cwd(), 'drizzle'));
  return {
    db: getDb(),
    async teardown() {
      await closeDb();
      await server.stop();
      await db.close();
    },
  };
}
