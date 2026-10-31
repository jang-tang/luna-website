'use client';

import { useRef, useState } from 'react';
import { DetailButton } from '@/components/layout/DetailButton';
import type { ProjectYear } from '@/services/content/types';
import { useEqualMaxWidth } from './useEqualMaxWidth';

/** 프로젝트 페이지 (원본 utils.project.js). 선택한 연도가 상단 제목에도 반영된다. */
export function ProjectPage({ years }: { years: ProjectYear[] }) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const current = years[active];
  useEqualMaxWidth(listRef, active);

  return (
    <>
      <div id="page" className="main" type="full" suppressHydrationWarning>
        <div id="inner">
          <div id="title">
            <span id="number">{current?.year}</span>년의 루나
          </div>
          <div id="description">
            LUNA에서는 어떤 활동들을 통해 사회적 문제들을 해결했을까요?
            <br />
            <span id="bold">스크롤하여 더 확인해보세요!</span>
          </div>
          <DetailButton />
        </div>
      </div>
      <div id="page" className="project" type="min" suppressHydrationWarning>
        <div id="inner">
          <div id="title">
            <span id="number">{current?.year}</span>년의 LUNA 프로젝트
          </div>
          <div id="category" className="vw" vw="100" suppressHydrationWarning>
            <div id="mix">
              {years.map((y, i) => (
                <div key={y.year} id="item" idx={String(y.year)} className={i === active ? 'active' : undefined} onClick={() => setActive(i)}>
                  {y.year}년
                </div>
              ))}
            </div>
          </div>
          <div id="project" ref={listRef}>
            {current?.projects.map((p) => (
              <div key={p.key} id="item" idx={p.name} suppressHydrationWarning>
                <div id="image" style={p.image ? { backgroundImage: `url('${p.image}')` } : undefined}></div>
                <div id="text">
                  <div id="name">{p.name}</div>
                  <div id="description">{p.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
