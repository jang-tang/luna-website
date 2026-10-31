import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb } from './client';

/**
 * drizzle/ 폴더의 버전 마이그레이션을 순서대로 적용한다.
 * 적용 이력은 drizzle.__drizzle_migrations 에 기록되므로 여러 번 실행해도 안전하다(이미 적용된 것은 건너뜀).
 * 파괴적인 변경(DROP 등)은 마이그레이션 파일을 직접 검토한 뒤에만 추가한다.
 */
export async function runMigrations(migrationsFolder = path.join(process.cwd(), 'drizzle')): Promise<void> {
  await migrate(getDb(), { migrationsFolder });
}
