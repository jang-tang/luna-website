import { NextResponse } from 'next/server';
import { pingDb } from '@/services/database/client';

/** 헬스체크 (로드밸런서/컨테이너용). 내부 정보는 노출하지 않는다. */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ms = await pingDb();
    return NextResponse.json({ ok: true, db: 'up', dbLatencyMs: Math.round(ms) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
