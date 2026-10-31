export type PageSlug = 'home' | 'member' | 'award' | 'project' | 'qna';

const ITEMS: Array<{ slug: PageSlug; href: string; label: string }> = [
  { slug: 'home', href: '/', label: '홈' },
  { slug: 'member', href: '/member', label: '멤버' },
  { slug: 'award', href: '/award', label: '업적' },
  { slug: 'project', href: '/project', label: '프로젝트' },
  { slug: 'qna', href: '/qna', label: 'Q&A' },
];

export function Navbar({ slug, glass }: { slug: PageSlug; glass: boolean }) {
  return (
    <div id="navbar" className={glass ? 'glass' : undefined} suppressHydrationWarning>
      <div id="inner">
        <a id="item" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- 원본과 동일한 고정 크기 로고 */}
          <img src="/logo/favicon-96x96.png" alt="" />
          LUNA
        </a>
        <div id="fill"></div>
        {ITEMS.map((item) => (
          <a key={item.slug} id="item" slug={item.slug} href={item.href} className={item.slug === slug ? 'active' : undefined}>
            <div id="active">{item.label}</div>
            <div id="deactive">{item.label}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
