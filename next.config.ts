import type { NextConfig } from 'next';

const LEGACY_PAGES = ['member', 'award', 'project', 'qna'] as const;

// CSP: 원본 레이아웃 스크립트와 Next.js 부트스트랩이 인라인 스크립트라 script-src 는 제한하지 않고,
// 클릭재킹·플러그인·base 태그 변조·외부 폼 전송·허용되지 않은 iframe 을 막는 지시어만 적용한다.
const contentSecurityPolicy = [
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  // HTTPS 로 제공될 때만 브라우저가 적용한다 (HTTP 에서는 무시됨)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

// 해시가 붙지 않은 public 자산: 하루 캐시 + 1주 stale-while-revalidate
const STATIC_ASSET_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // 기존 URL(*.html, /index.html) 을 그대로 유지한다
  async rewrites() {
    return [
      { source: '/index.html', destination: '/' },
      ...LEGACY_PAGES.map((page) => ({ source: `/${page}.html`, destination: `/${page}` })),
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      ...['img', 'icon', 'logo', 'model'].map((dir) => ({
        source: `/${dir}/:path*`,
        headers: [{ key: 'Cache-Control', value: STATIC_ASSET_CACHE }],
      })),
      { source: '/favicon.ico', headers: [{ key: 'Cache-Control', value: STATIC_ASSET_CACHE }] },
    ];
  },
};

export default nextConfig;
