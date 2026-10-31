import { DetailButton } from '@/components/layout/DetailButton';
import type { MemberGroup } from '@/services/content/types';
import { MemberList } from './MemberList';

export function MemberPage({ groups }: { groups: MemberGroup[] }) {
  return (
    <>
      <div id="page" className="main" type="full" suppressHydrationWarning>
        <div id="inner">
          <div id="title">Members of LUNA</div>
          <div id="description">
            2018년부터 지금의 LUNA가 있기까지,
            <br />
            <span id="bold">LUNA의 목표를 향해 함께 달려가고 있는</span>
            <br />
            1기부터 7기까지의 멤버들과 명예 동아리원들입니다.
          </div>
          <DetailButton />
        </div>
      </div>
      <MemberList groups={groups} />
    </>
  );
}
