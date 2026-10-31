import { NextResponse, type NextRequest } from 'next/server';
import { isAdminAuthorized, isAdminEnabled } from '@/lib/admin-auth';

/**
 * /admin/* 보호 (HTTP Basic 인증).
 * ADMIN_PASSWORD 가 설정되지 않으면 관리 페이지 자체를 404 로 숨긴다.
 */
export function proxy(request: NextRequest) {
  if (!isAdminEnabled()) return new NextResponse('Not found', { status: 404 });
  if (isAdminAuthorized(request.headers.get('authorization'))) {
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="LUNA admin", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}

export const config = { matcher: ['/admin/:path*'] };
