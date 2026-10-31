import { safeEqual } from './safe-equal';

/**
 * 관리 페이지 HTTP Basic 인증 검증 (proxy 와 서버 액션에서 공통 사용).
 * ADMIN_PASSWORD 가 없거나 12자 미만이면 관리 기능 자체를 비활성화한다.
 */
export function isAdminEnabled(): boolean {
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(password && password.length >= 12);
}

export function isAdminAuthorized(authorization: string | null | undefined): boolean {
  if (!isAdminEnabled() || !authorization?.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = atob(authorization.slice(6).trim());
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep <= 0) return false;
  const user = process.env.ADMIN_USER || 'admin';
  // 두 비교를 모두 수행해 아이디 일치 여부가 응답 시간으로 드러나지 않게 한다
  const userOk = safeEqual(decoded.slice(0, sep), user);
  const passOk = safeEqual(decoded.slice(sep + 1), process.env.ADMIN_PASSWORD!);
  return userOk && passOk;
}
