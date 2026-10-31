'use client';

import { AppShell } from '@/components/layout/AppShell';

/**
 * 렌더링 오류(예: 캐시가 없는 상태에서 DB 장애) 시 빈 화면 대신 기본 레이아웃과 재시도 안내를 보여준다.
 * 이미 캐시된 페이지가 있으면 Next.js 가 마지막 성공 페이지를 계속 제공하므로 이 화면은 거의 노출되지 않는다.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell slug="qna">
      <div id="page" className="main">
        <div id="inner">
          <div id="text">
            <div id="title">잠시 후 다시 시도해주세요</div>
            <div id="description">
              콘텐츠를 불러오는 중 일시적인 문제가 발생했습니다.{' '}
              <span id="bold" style={{ cursor: 'pointer' }} onClick={() => reset()}>
                다시 시도
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
