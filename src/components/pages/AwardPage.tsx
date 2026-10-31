import { DetailButton } from '@/components/layout/DetailButton';
import type { AwardYear, SiteSettings } from '@/services/content/types';
import { AwardList } from './AwardList';

export function AwardPage({ years, settings }: { years: AwardYear[]; settings: SiteSettings }) {
  return (
    <>
      <div id="page" className="main" type="full" suppressHydrationWarning>
        <div id="inner">
          <div id="text">
            <div id="slogan">Share the Moonlight,</div>
            <div id="title">루나의 업적</div>
            <div id="description">
              모든 사회 구성원이 평등하길 바라는 LUNA는{' '}
              <span id="bold">2018년부터 동아리 내에서 팀을 이루어 {settings.contestCount}개의 대회 등, 다양한 외부 활동에 참여</span>하였습니다. 그 결과 LUNA는 능력을 인정받고{' '}
              <span id="bold">지금까지 총 {settings.prizeTotal} 이상의 상금 및 지원금</span>을 받았습니다.
            </div>
          </div>
          <div id="logo"></div>
          <DetailButton />
        </div>
      </div>
      <AwardList years={years} />
    </>
  );
}
