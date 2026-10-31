import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseEnv } from '@/config/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

type Holder = { sql: postgres.Sql; db: Database; url: string };

// dev 서버 HMR 시 커넥션 풀이 중복 생성되지 않도록 globalThis 에 보관한다
const globalForDb = globalThis as unknown as { __lunaDb?: Holder };

function createHolder(url: string): Holder {
  const env = getDatabaseEnv();
  const isLocal = /@(localhost|127\.0\.0\.1|db|postgres)(:\d+)?\//.test(url);
  const sql = postgres(url, {
    max: env.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 5,
    max_lifetime: 60 * 30,
    ssl: env.DATABASE_SSL === 'disable' || (env.DATABASE_SSL === 'prefer' && isLocal) ? false : env.DATABASE_SSL === 'require' ? 'require' : 'prefer',
    prepare: env.DATABASE_PREPARE,
    onnotice: () => {},
    connection: { application_name: 'luna-website', statement_timeout: 15_000 },
  });
  return { sql, db: drizzle(sql, { schema }), url };
}

export function getDb(): Database {
  const { DATABASE_URL } = getDatabaseEnv();
  const current = globalForDb.__lunaDb;
  if (current && current.url === DATABASE_URL) return current.db;
  const holder = createHolder(DATABASE_URL);
  globalForDb.__lunaDb = holder;
  return holder.db;
}

export function getSql(): postgres.Sql {
  getDb();
  return globalForDb.__lunaDb!.sql;
}

export async function closeDb(): Promise<void> {
  const holder = globalForDb.__lunaDb;
  globalForDb.__lunaDb = undefined;
  if (holder) await holder.sql.end({ timeout: 5 });
}

export async function pingDb(): Promise<number> {
  const started = performance.now();
  await getSql()`select 1`;
  return performance.now() - started;
}
