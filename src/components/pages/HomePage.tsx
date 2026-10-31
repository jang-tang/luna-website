import { AwardParallax } from '@/components/home/AwardParallax';
import { Luna3D } from '@/components/home/Luna3D';
import { ProjectTags } from '@/components/home/ProjectTags';
import { DetailButton } from '@/components/layout/DetailButton';
import type { SiteSettings } from '@/services/content/types';

/* eslint-disable @next/next/no-img-element -- 원본과 동일한 장식 이미지(고정 폭, CSS 애니메이션) */
export function HomePage({ settings }: { settings: SiteSettings }) {
  return (
    <>
      <div id="page" className="main" type="full" suppressHydrationWarning>
        <div id="inner">
          <div id="text">
            <div id="slogan">세상을 비추는 달,</div>
            <div id="title">LUNA</div>
            <div id="description">
              <span id="bold">LUNA</span>는 한국디지털미디어고등학교의 유일한 <span id="bold">IT 소셜벤처 동아리</span>로 다양한 사회적 문제들을 해결하고{' '}
              <span id="bold">모두가 함께 살 수 있는 세상을 만들기 위해 노력하고 있습니다.</span>
            </div>
          </div>
          <Luna3D />
          <DetailButton />
        </div>
      </div>
      <div id="page" className="project" type="min" suppressHydrationWarning>
        <div id="inner">
          <div id="text">루나의 크루원들은 지금까지 자발적으로</div>
          <ProjectTags lines={settings.homeTags} />
          <div id="mix">
            <div id="text">
              <span id="bold">{settings.projectCount}개의 프로젝트</span>를 진행하며
              <br />
              사회적인 가치를 창출해왔습니다.
            </div>
            <a id="more" href="/project">
              루나가 진행한 프로젝트 보러가기<div id="icon"></div>
            </a>
          </div>
        </div>
      </div>
      <div id="page" className="award" type="min" suppressHydrationWarning>
        <div id="inner">
          <div id="mix">
            <div id="text">
              <div id="title">
                <span id="bold">{settings.contestCount}개</span>의 대회,
                <br />
                <span id="bold">{settings.prizeTotal} 이상</span>의 상금 및 지원금
              </div>
              <div id="description">
                루나는 사회 문제 해결 의지와 능력을 인정받고자 하였고, 그 결과 지금까지 <span id="bold">{settings.contestCount}개의 대회에 출전</span>하여{' '}
                <span id="bold">상금 및 지원금 총 {settings.prizeTotal} 이상</span>을 받았습니다.
              </div>
              <a id="more" href="/award">
                루나의 업적 알아보기<div id="icon"></div>
              </a>
            </div>
            <AwardParallax />
          </div>
        </div>
      </div>
      <div id="page" className="future" type="min" suppressHydrationWarning>
        <div id="inner">
          <div id="box">
            <div id="text">
              루나는 앞으로도 여러분들과 함께
              <br />
              <span id="bold">IT기술을 바탕으로 평등한 세상을 만들자</span>는
              <br />
              목표를 향하여 무한히 달려나갈 것입니다
            </div>
            <div id="image" className="luna"><img src="/img/home/future/luna.webp" alt="" width={160} height={160} loading="lazy" decoding="async" /></div>
            <div id="image" className="hand"><img src="/img/home/future/hand.webp" alt="" width={430} height={430} loading="lazy" decoding="async" /></div>
            <div id="image" className="circle1"><img src="/img/home/future/circle1.webp" alt="" width={70} height={70} loading="lazy" decoding="async" /></div>
            <div id="image" className="circle2"><img src="/img/home/future/circle2.webp" alt="" width={180} height={180} loading="lazy" decoding="async" /></div>
            <div id="image" className="circle3"><img src="/img/home/future/circle3.webp" alt="" width={280} height={280} loading="lazy" decoding="async" /></div>
          </div>
        </div>
      </div>
    </>
  );
}
