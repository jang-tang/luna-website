'use client';

import { useRef, useState } from 'react';
import type { AwardYear } from '@/services/content/types';
import { AWARD_IMAGE_FALLBACK, useFailedImages } from './image-fallback';
import { useEqualMaxWidth } from './useEqualMaxWidth';

/** 업적 섹션: 연도 탭 + 카드 (원본 utils.award.js) */
export function AwardList({ years }: { years: AwardYear[] }) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const current = years[active];
  useEqualMaxWidth(listRef, active);
  const failed = useFailedImages(current?.awards.map((a) => a.image) ?? []);

  return (
    <div id="page" className="award" type="min" suppressHydrationWarning>
      <div id="inner">
        <div id="title">
          <span id="number">{current?.year}</span>년의 LUNA
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
        <div id="award" ref={listRef}>
          {current?.awards.map((a) => (
            <div key={a.key} id="item" idx={a.name} suppressHydrationWarning>
              <div id="image" style={a.image && !failed.has(a.image) ? { backgroundImage: `url('${a.image}')` } : AWARD_IMAGE_FALLBACK}></div>
              <div id="text">
                <div id="name">{a.name}</div>
                <div id="prize">{a.prize}</div>
                <div id="team">
                  {a.team} - {a.members}
                </div>
                <div id="date">{a.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
