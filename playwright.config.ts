import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 테스트. 기본은 이미 실행 중인 서버(E2E_BASE_URL, 기본 http://localhost:3000)를 대상으로 한다.
 * E2E_START_SERVER=1 이면 빌드된 앱을 직접 띄운다 (DB 가 준비되어 있어야 함).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_START_SERVER ? { command: 'npm run start', url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 } : undefined,
});
