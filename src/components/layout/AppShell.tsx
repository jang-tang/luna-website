import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { Footer } from './Footer';
import { Navbar, type PageSlug } from './Navbar';
import { NavbarGlass } from './NavbarGlass';

// 상단 전체 화면 배경(CSS background)은 CSS 를 받은 뒤에야 발견되므로 미리 높은 우선순위로 요청 (LCP 개선)
const HERO_IMAGES: Partial<Record<PageSlug, string>> = {
  member: '/img/member/main/background.webp',
  project: '/img/project/main/background.webp',
};

/** 원본 각 HTML 페이지의 공통 골격: #app > #navbar + #scroll > #content > (페이지들 + #footer) */
export function AppShell({ slug, children }: { slug: PageSlug; children: ReactNode }) {
  const hero = HERO_IMAGES[slug];
  if (hero) preload(hero, { as: 'image', fetchPriority: 'high' });
  // 멤버/프로젝트 페이지는 상단 배경 이미지 위에서 내비게이션을 투명(glass)하게 표시
  const glass = slug === 'member' || slug === 'project';
  return (
    <div id="app" className={slug} suppressHydrationWarning>
      <Navbar slug={slug} glass={glass} />
      {glass && <NavbarGlass />}
      <div id="scroll" suppressHydrationWarning>
        <div id="content">
          {children}
          <Footer />
        </div>
      </div>
    </div>
  );
}
