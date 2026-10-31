import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';

/**
 * /admin/* 보호 (HTTP Basic 인증).
 * ADMIN_PASSWORD 가 설정되지 않으면 관리 페이지 자체를 404 로 숨긴다.
 */
export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) return new NextResponse('Not found', { status: 404 });
  const user = process.env.ADMIN_USER || 'admin';
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(':');
      if (sep > 0 && safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), password)) {
        const res = NextResponse.next();
        res.headers.set('X-Robots-Tag', 'noindex, nofollow');
        res.headers.set('Cache-Control', 'no-store');
        return res;
      }
    } catch {
      // 잘못된 base64 → 인증 실패
    }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="LUNA admin", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}

export const config = { matcher: ['/admin/:path*'] };
