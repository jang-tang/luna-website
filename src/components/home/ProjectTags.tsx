'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useScrollScene } from '@/components/hooks/useScrollScene';

const TAG_MARGIN = 12; // #tag margin: 0 6px

/**
 * 홈 프로젝트 섹션의 흐르는 태그 3줄 (원본 setTags + ScrollMagic/GSAP 트윈).
 * - 각 줄은 (앱 폭 + 앱 높이/4) 를 넘을 때까지 태그를 반복해서 채운다
 * - 스크롤 진행률에 따라 줄마다 좌/우로 25vh 이동
 * SSR 에서도 한 바퀴 분량의 태그를 렌더링해 하이드레이션 전 레이아웃 높이를 확보한다.
 */
export function ProjectTags({ lines }: { lines: string[][] }) {
  // ScrollMagic 트리거는 섹션(#page.project) 자체
  const triggerRef = useRef<HTMLElement | null>(null);
  const setTagsRef = useCallback((el: HTMLDivElement | null) => {
    triggerRef.current = el?.closest<HTMLElement>('#page') ?? null;
  }, []);
  const mixRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [counts, setCounts] = useState(() => lines.map((names) => names.length));
  // 태그 폭은 글꼴에만 의존하므로 SSR 로 렌더링된 첫 한 바퀴에서 한 번 측정해 둔다
  const widthsRef = useRef<number[][] | null>(null);

  const measureWidths = useCallback(() => {
    const measured = lines.map((names, i) =>
      Array.from(mixRefs.current[i]?.children ?? [])
        .slice(0, names.length)
        .map((el) => (el as HTMLElement).offsetWidth + TAG_MARGIN),
    );
    // 한 바퀴 분량이 모두 렌더링되어 있을 때만 갱신
    if (measured.every((w, i) => w.length === lines[i]!.length)) widthsRef.current = measured;
  }, [lines]);

  const measure = useCallback(() => {
    if (!widthsRef.current) measureWidths();
    const app = document.getElementById('app');
    const navInner = document.querySelector('#navbar #inner');
    if (!app || !navInner) return;
    const appWidth = parseFloat(getComputedStyle(app).width) || 0;
    const appHeight = parseFloat(getComputedStyle(app).height) || 0;
    const target = appWidth + appHeight / 4;
    const next = lines.map((names, i) => {
      const widths = widthsRef.current?.[i];
      if (!widths || widths.length === 0) return names.length;
      let width = 0;
      let count = 0;
      while (width <= target && count < 1000) {
        width += widths[count % widths.length] ?? 0;
        count++;
      }
      return count;
    });
    setCounts((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    const shift = (appWidth - (parseFloat(getComputedStyle(navInner).width) || 0)) / -2;
    lineRefs.current.forEach((line) => {
      if (line) line.style.transform = `translateX(${shift}px)`;
    });
  }, [lines, measureWidths]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    // 웹폰트(swap) 적용 후 폭이 달라지므로 다시 측정
    let active = true;
    document.fonts?.ready.then(() => {
      if (!active) return;
      measureWidths();
      measure();
    });
    return () => {
      active = false;
      window.removeEventListener('resize', measure);
    };
  }, [measure, measureWidths]);

  const onProgress = useCallback((p: number) => {
    const distance = window.innerHeight * 0.25 * p;
    mixRefs.current.forEach((mix, index) => {
      if (mix) mix.style.transform = `translateX(${index % 2 ? distance : -distance}px)`;
    });
  }, []);
  useScrollScene(triggerRef, onProgress);

  return (
    <div id="tags" ref={setTagsRef}>
      {lines.map((names, index) => (
        <div key={index} id="line" className="vw" vw="100" idx={String(index)} ref={(el) => void (lineRefs.current[index] = el)} suppressHydrationWarning>
          <div id="mix" ref={(el) => void (mixRefs.current[index] = el)}>
            {Array.from({ length: counts[index] ?? names.length }, (_, count) => (
              <div key={count} id="tag" data-style={String((count % 3) + 1)}>
                {names[count % names.length]}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
