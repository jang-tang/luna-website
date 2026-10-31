import { AppShell } from '@/components/layout/AppShell';

export default function NotFound() {
  return (
    <AppShell slug="qna">
      <div id="page" className="main">
        <div id="inner">
          <div id="text">
            <div id="title">페이지를 찾을 수 없습니다</div>
            <div id="description">
              주소가 바뀌었거나 삭제된 페이지입니다. <a href="/"><span id="bold">홈으로 돌아가기</span></a>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
