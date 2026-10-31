import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import type { PageSlug } from '@/components/layout/Navbar';
import { AwardPage } from '@/components/pages/AwardPage';
import { HomePage } from '@/components/pages/HomePage';
import { MemberPage } from '@/components/pages/MemberPage';
import { ProjectPage } from '@/components/pages/ProjectPage';
import { QnaPage } from '@/components/pages/QnaPage';
import { getAwardYears, getMemberGroups, getProjectYears, getQnas, getSiteSettings } from '@/services/cache/content';
import { canReachDatabase } from '@/services/database/build-check';

/**
 * 모든 기존 URL(/, /member(.html), /award(.html), /project(.html), /qna(.html))을 처리하는 단일 라우트.
 * - ISR: DB 에서 읽어 정적 HTML 로 캐시하고, 동기화 시 태그 무효화(SWR) + 1시간 시간 기반 안전망
 * - 빌드 시 DB 에 접근 가능하면 미리 렌더링하고, 불가능하면(Docker 빌드 등) 첫 요청 시 렌더링 후 캐시한다
 */
export const revalidate = 3600;
export const dynamicParams = true;

const ROUTES: Record<string, PageSlug> = { '': 'home', member: 'member', award: 'award', project: 'project', qna: 'qna' };

export async function generateStaticParams() {
  if (!(await canReachDatabase())) return [];
  return Object.keys(ROUTES).map((path) => ({ slug: path ? [path] : [] }));
}

export default async function Page({ params }: PageProps<'/[[...slug]]'>) {
  const { slug: segments = [] } = await params;
  const slug = segments.length <= 1 ? ROUTES[segments[0] ?? ''] : undefined;
  if (!slug) notFound();

  switch (slug) {
    case 'home':
      return (
        <AppShell slug="home">
          <HomePage settings={await getSiteSettings()} />
        </AppShell>
      );
    case 'member':
      return (
        <AppShell slug="member">
          <MemberPage groups={await getMemberGroups()} />
        </AppShell>
      );
    case 'award': {
      const [years, settings] = await Promise.all([getAwardYears(), getSiteSettings()]);
      return (
        <AppShell slug="award">
          <AwardPage years={years} settings={settings} />
        </AppShell>
      );
    }
    case 'project':
      return (
        <AppShell slug="project">
          <ProjectPage years={await getProjectYears()} />
        </AppShell>
      );
    case 'qna': {
      const [qnas, settings] = await Promise.all([getQnas(), getSiteSettings()]);
      return (
        <AppShell slug="qna">
          <QnaPage qnas={qnas} settings={settings} />
        </AppShell>
      );
    }
  }
}
