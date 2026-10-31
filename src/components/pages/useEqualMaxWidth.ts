'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * 원본 resizeItem (업적/프로젝트 카드): 모든 카드의 max-width 를 첫 번째 카드 폭으로 맞춰
 * 마지막 줄 카드가 늘어나지 않게 한다. (첫 카드는 CSS 에서 max-width: unset !important)
 */
export function useEqualMaxWidth(listRef: RefObject<HTMLElement | null>, dependency: unknown) {
  useLayoutEffect(() => {
    const resize = () => {
      const list = listRef.current;
      const first = list?.firstElementChild as HTMLElement | null;
      if (!list || !first) return;
      const width = parseFloat(getComputedStyle(first).width) || 0;
      for (const item of Array.from(list.children) as HTMLElement[]) item.style.maxWidth = `${width}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [listRef, dependency]);
}
