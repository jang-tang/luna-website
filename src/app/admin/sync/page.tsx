import type { Metadata } from 'next';
import { getDb } from '@/services/database/client';
import { getSyncOverview } from '@/services/database/sync-repository';
import { triggerSync } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '동기화 관리 - LUNA', robots: { index: false, follow: false } };

const fmt = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-';

const cell = { padding: '6px 10px', borderBottom: '1px solid #e2e0ec', textAlign: 'left' as const, whiteSpace: 'nowrap' as const };

/** 내부 운영용 동기화 상태 페이지 (사이트 UI 와 분리된 단순 화면) */
export default async function AdminSyncPage() {
  const overview = await getSyncOverview(getDb(), 30);
  const lastRun = overview.runs.find((r) => r.status !== 'skipped');
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', padding: 32, fontSize: 14, display: 'block', userSelect: 'text' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Notion 동기화 상태</h1>
      <p>마지막 시작: {fmt(lastRun?.startedAt)} · 결과: {lastRun?.status ?? '-'} · 마지막 성공: {fmt(overview.lastSuccessAt)}</p>
      <p>실행 중 잠금: {overview.locks.length ? `${fmt(overview.locks[0]!.acquiredAt)} ~ ${fmt(overview.locks[0]!.lockedUntil)}` : '없음'}</p>
      <form action={triggerSync} style={{ display: 'flex', flexDirection: 'row', gap: 8, margin: '16px 0' }}>
        <button name="mode" value="auto" type="submit" style={{ padding: '8px 16px' }}>증분 동기화 실행</button>
        <button name="mode" value="full" type="submit" style={{ padding: '8px 16px' }}>전체 동기화 실행</button>
      </form>

      <h2 style={{ fontSize: 18, margin: '24px 0 8px' }}>컬렉션 상태</h2>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead><tr>{['컬렉션', '커서', '마지막 성공', '마지막 전체 동기화', '최근 오류'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
        <tbody>
          {overview.states.map((s) => (
            <tr key={s.collection}>
              <td style={cell}>{s.collection}</td><td style={cell}>{fmt(s.cursor)}</td><td style={cell}>{fmt(s.lastSuccessAt)}</td>
              <td style={cell}>{fmt(s.lastFullSyncAt)}</td><td style={{ ...cell, whiteSpace: 'normal' }}>{s.lastError ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 18, margin: '24px 0 8px' }}>최근 실행</h2>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead><tr>{['#', '트리거', '모드', '상태', '시작', '종료', '추가', '수정', '삭제', '비공개', '복구', '실패', '오류'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
        <tbody>
          {overview.runs.map((r) => {
            const total = Object.values(r.stats).reduce(
              (acc, s) => ({ added: acc.added + s.added, updated: acc.updated + s.updated, deleted: acc.deleted + s.deleted, hidden: acc.hidden + s.hidden, restored: acc.restored + s.restored, failed: acc.failed + s.failed }),
              { added: 0, updated: 0, deleted: 0, hidden: 0, restored: 0, failed: 0 },
            );
            return (
              <tr key={r.id}>
                <td style={cell}>{r.id}</td><td style={cell}>{r.trigger}</td><td style={cell}>{r.mode}</td><td style={cell}>{r.status}</td>
                <td style={cell}>{fmt(r.startedAt)}</td><td style={cell}>{fmt(r.finishedAt)}</td>
                <td style={cell}>{total.added}</td><td style={cell}>{total.updated}</td><td style={cell}>{total.deleted}</td>
                <td style={cell}>{total.hidden}</td><td style={cell}>{total.restored}</td><td style={cell}>{total.failed}</td>
                <td style={{ ...cell, whiteSpace: 'normal', maxWidth: 480 }}>{r.errors.slice(0, 5).map((e, i) => <div key={i} style={{ display: 'block' }}>{[e.collection, e.pageId, e.message].filter(Boolean).join(' · ')}</div>)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
