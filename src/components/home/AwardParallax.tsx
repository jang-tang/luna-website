'use client';

import { useCallback, useRef } from 'react';
import { useScrollScene } from '@/components/hooks/useScrollScene';

/** 홈 업적 섹션 이미지 패럴랙스 (원본: #main 100px→-100px, #shadow -100px→100px) */
export function AwardParallax() {
  const imageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const onProgress = useCallback((p: number) => {
    const offset = 100 - 200 * p;
    if (mainRef.current) mainRef.current.style.transform = `translateY(${offset}px)`;
    if (shadowRef.current) shadowRef.current.style.transform = `translateY(${-offset}px)`;
  }, []);

  // 트리거는 섹션(#page.award) 자체
  const setImageRef = useCallback((el: HTMLDivElement | null) => {
    imageRef.current = el;
    triggerRef.current = el?.closest<HTMLElement>('#page') ?? null;
  }, []);
  useScrollScene(triggerRef, onProgress);

  return (
    <div id="image" ref={setImageRef}>
      <div id="main" ref={mainRef} style={{ transform: 'translateY(100px)' }}></div>
      <div id="shadow" ref={shadowRef} style={{ transform: 'translateY(-100px)' }}></div>
    </div>
  );
}
