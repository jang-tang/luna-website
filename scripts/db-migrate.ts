/**
 * DB 마이그레이션 실행 (재실행 안전).
 *   npm run db:migrate
 */
import './lib/env';
import { closeDb } from '../src/services/database/client';
import { runMigrations } from '../src/services/database/migrate';
import { logger } from '../src/lib/logger';

runMigrations()
  .then(() => logger.info('db.migrated'))
  .catch((err) => {
    logger.error('db.migrate_failed', { err });
    process.exitCode = 1;
  })
  .finally(() => closeDb());
