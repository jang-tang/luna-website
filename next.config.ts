import type { NextConfig } from 'next';

const LEGACY_PAGES = ['member', 'award', 'project', 'qna'] as const;

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
