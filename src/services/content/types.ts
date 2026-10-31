/**
 * UI 컴포넌트가 기대하는 데이터 형태(View Model).
 * 원본 jQuery 코드가 data/*.js 에서 읽던 필드와 1:1 로 대응되도록 유지한다.
 * DB/Notion 구조가 바뀌어도 이 타입만 지키면 UI 는 변경할 필요가 없다.
 */

export type MemberCard = {
  key: string;
  name: string;
  position: string;
  className: string;
  description: string;
  /** 없으면 null → UI 에서 기본 프로필(default.svg) 사용 */
  image: string | null;
};

export type MemberGroup = { name: string; members: MemberCard[] };

export type AwardCard = {
  key: string;
  name: string;
  prize: string;
  team: string;
  /** 원본은 배열을 문자열로 결합해 출력했다(`${data.members}` → "a,b") */
  members: string;
  date: string;
  image: string | null;
};

export type AwardYear = { year: number; awards: AwardCard[] };

export type ProjectCard = {
  key: string;
  name: string;
  description: string;
  image: string | null;
};

export type ProjectYear = { year: number; projects: ProjectCard[] };

export type QnaItem = { key: string; question: string; answer: string };

export type SiteSettings = {
  /** 홈 "N개의 프로젝트" */
  projectCount: string;
  /** 홈/업적 "N개의 대회" */
  contestCount: string;
  /** 홈/업적 "7,500만원 이상" 의 금액 부분 */
  prizeTotal: string;
  /** 홈 프로젝트 섹션의 흐르는 태그 3줄 */
  homeTags: string[][];
  /** Q&A 페이지 유튜브 임베드 URL */
  qnaVideoUrl: string;
};
