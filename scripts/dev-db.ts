/**
 * 로컬 개발/테스트용 PostgreSQL (PGlite = WASM 으로 빌드된 실제 PostgreSQL 엔진).
 * Docker/설치 없이 운영과 동일한 postgres.js 드라이버로 접속할 수 있게 wire protocol 소켓 서버를 띄운다.
 *
 *   npm run db:dev            # 데이터는 .pglite/ 에 보존
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres
 *
 * 운영 환경에서는 사용하지 않는다 (docker-compose 의 postgres 또는 관리형 PostgreSQL 사용).
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export async function startDevDb(options: { dataDir?: string; port?: number } = {}) {
  const db = await PGlite.create(options.dataDir);
  const server = new PGLiteSocketServer({ db, port: options.port ?? 54329, host: '127.0.0.1', maxConnections: 20 });
  await server.start();
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${options.port ?? 54329}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}

if (process.argv[1]?.endsWith('dev-db.ts')) {
  const port = Number(process.env.DEV_DB_PORT ?? 54329);
  startDevDb({ dataDir: process.env.DEV_DB_DIR ?? '.pglite', port }).then(({ url, stop }) => {
    console.log(`PGlite listening: ${url}`);
    const shutdown = () => void stop().then(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
