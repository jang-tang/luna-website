import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 원본 사이트는 전체 페이지 이동(<a>)으로 페이지마다 페이드인·레이아웃 스크립트가 다시 실행된다.
      // 동일한 UX 를 유지하기 위해 next/link 클라이언트 내비게이션을 쓰지 않는다.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    ignores: ['.next/**', 'dist/**', 'test-results/**', 'playwright-report/**', 'node_modules/**', 'content/seed/**', 'drizzle/**', 'next-env.d.ts', 'public/**'],
  },
];

export default config;
