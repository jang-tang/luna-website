import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { LAYOUT_SCRIPT } from '@/lib/layout-script';
import '@/styles/style.scss';

// 운영 도메인은 환경변수로만 지정한다 (기존 luna.codes 는 탈취되어 사용하지 않음).
// 설정하지 않으면 canonical/og:url 을 출력하지 않는다.
const SITE_URL = process.env.SITE_URL?.replace(/\/$/, '') || undefined;
const TITLE = '세상을 비추는 달, LUNA';
const DESCRIPTION = '한국디지털미디어고등학교의 IT 소셜벤처 동아리';

// 원본 index.html 의 <head> 메타 태그와 동일하게 구성
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL ?? 'http://localhost:3000'),
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['루나', 'LUNA', '디미고', 'DIMIGO', '동아리', 'IT소셜벤처'],
  authors: [{ name: '루나' }],
  ...(SITE_URL ? { alternates: { canonical: SITE_URL } } : {}),
  manifest: '/logo/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent' },
  icons: {
    shortcut: '/favicon.ico',
    icon: [
      { url: '/logo/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/logo/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [57, 60, 72, 76, 114, 120, 144, 152, 180].map((s) => ({ url: `/logo/apple-icon-${s}x${s}.png`, sizes: `${s}x${s}` })),
  },
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION, images: ['/logo/logo-512x512.png'], ...(SITE_URL ? { url: SITE_URL } : {}) },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/logo/logo-512x512.png'] },
  other: {
    'msapplication-TileColor': '#524B9B',
    'msapplication-TileImage': '/logo/ms-icon-144x144.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#524B9B',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        {/* 하이드레이션 전에 레이아웃(스케일/높이/폭)을 계산해 원본과 같은 첫 화면을 보장 */}
        <script dangerouslySetInnerHTML={{ __html: LAYOUT_SCRIPT }} />
      </body>
    </html>
  );
}
