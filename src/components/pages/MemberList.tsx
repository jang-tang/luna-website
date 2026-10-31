'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { MemberGroup } from '@/services/content/types';

const DEFAULT_PROFILE = '/img/member/profile/default.svg';
const GAP = 30;

/** 멤버 섹션: 기수 탭 + 카드 그리드 (원본 utils.member.js) */
export function MemberList({ groups }: { groups: MemberGroup[] }) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const group = groups[active];

  // 원본 resizeItem: 카드 폭과 컨테이너 폭으로 1/2/3열 여백을 계산
  const resizeItem = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.children) as HTMLElement[];
    items.forEach((item) => item.removeAttribute('style'));
    list.removeAttribute('style');
    list.style.width = '100%';
    const listWidth = parseFloat(getComputedStyle(list).width) || 0;
    const itemWidth = items[0] ? parseFloat(getComputedStyle(items[0]).width) || 0 : 0;
    const count = itemWidth > 0 ? Math.floor((listWidth + GAP) / (itemWidth + GAP)) : 0;
    if (count >= 3) {
      const margin = (listWidth - itemWidth * 3) / 2;
      items.forEach((item) => (item.style.marginRight = `${margin}px`));
      list.style.marginRight = `-${margin}px`;
    } else if (count === 2) {
      const margin = listWidth - itemWidth * 2;
      if (margin / 4 >= GAP) {
        items.forEach((item) => {
          item.style.marginLeft = `${margin / 4}px`;
          item.style.marginRight = `${margin / 4}px`;
        });
      } else {
        items.forEach((item) => (item.style.marginRight = `${margin}px`));
        list.style.marginRight = `-${margin}px`;
      }
    } else {
      items.forEach((item) => (item.style.width = '100%'));
    }
    list.style.width = 'unset';
  }, []);

  useLayoutEffect(() => {
    resizeItem();
  }, [active, resizeItem]);

  useLayoutEffect(() => {
    window.addEventListener('resize', resizeItem);
    return () => window.removeEventListener('resize', resizeItem);
  }, [resizeItem]);

  return (
    <div id="page" className="member" type="min" suppressHydrationWarning>
      <div id="inner">
        <div id="title">{group?.name}</div>
        <div id="category" className="vw" vw="100" suppressHydrationWarning>
          <div id="mix">
            {groups.map((g, i) => (
              <div key={g.name} id="item" idx={g.name} className={i === active ? 'active' : undefined} onClick={() => setActive(i)}>
                {g.name}
              </div>
            ))}
          </div>
        </div>
        <div id="member" ref={listRef} suppressHydrationWarning>
          {group?.members.map((m) => (
            <div key={m.key} id="item" idx={m.name} suppressHydrationWarning>
              <div id="position">{m.position}</div>
              <div id="image" style={{ backgroundImage: `url(${m.image ?? DEFAULT_PROFILE})` }}></div>
              <div id="name">{m.name}</div>
              <div id="class">{m.className}</div>
              <div id="description">{m.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
