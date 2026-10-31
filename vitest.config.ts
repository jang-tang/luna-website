import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Next.js 전용 가드 모듈은 테스트 환경에서 빈 모듈로 대체
      'server-only': path.resolve(__dirname, 'tests/helpers/empty.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // 통합 테스트는 파일마다 별도 PGlite 인스턴스를 쓰지만 CPU 부담을 줄이기 위해 순차 실행
    fileParallelism: false,
    env: { NODE_ENV: 'test', LOG_LEVEL: 'error' },
  },
});
