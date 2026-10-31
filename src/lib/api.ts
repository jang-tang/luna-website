import { NextResponse } from 'next/server';
import { AppError, UnauthorizedError } from './errors';
import { logger } from './logger';
import { safeEqual } from './safe-equal';

/** 공통 API 응답 형식: { ok: true, data } | { ok: false, error: { code, message } } */
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const NO_STORE = { 'Cache-Control': 'no-store' };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, { status, headers: NO_STORE });
}

export function fail(err: unknown) {
  const appErr = err instanceof AppError ? err : null;
  const status = appErr?.status ?? 500;
  if (status >= 500) logger.error('api.error', { err });
  // 운영 환경에서 내부 오류 상세(스택/쿼리/외부 API 메시지)를 노출하지 않는다
  const message = appErr?.expose ? appErr.message : 'Internal server error';
  return NextResponse.json<ApiResponse<never>>(
    { ok: false, error: { code: appErr?.code ?? 'internal_error', message } },
    { status, headers: NO_STORE },
  );
}

/**
 * 스케줄러/운영자용 엔드포인트 인증. Authorization: Bearer <SYNC_SECRET | CRON_SECRET>
 * (Vercel Cron 은 CRON_SECRET 을 Bearer 로 보낸다)
 */
export function assertSyncAuthorized(request: Request, secrets: Array<string | undefined>) {
  const configured = secrets.filter((s): s is string => Boolean(s));
  if (configured.length === 0) throw new AppError('sync_disabled', 'Sync endpoint is not configured', { status: 503, expose: true });
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token || !configured.some((secret) => safeEqual(token, secret))) throw new UnauthorizedError();
}
