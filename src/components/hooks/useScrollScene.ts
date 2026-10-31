'use client';

import { useEffect, type RefObject } from 'react';

/**
 * ScrollMagic Scene({ triggerElement, triggerHook: 1, duration: '200%' }) 와 동일한 진행률 계산.
 *   start    = (요소 top - 컨테이너 top) + scrollTop - 컨테이너높이 × triggerHook
 *   duration = 컨테이너높이 × 2
 *   progress = clamp((scrollTop - start) / duration, 0, 1)
 * ScrollMagic 이 getBoundingClientRect 와 clientHeight 를 섞어 쓰는 방식까지 그대로 따라
 * 모바일(body scale) 환경에서도 원본과 같은 움직임을 낸다.
 */
export function useScrollScene(triggerRef: RefObject<HTMLElement | null>, onProgress: (progress: number) => void) {
  useEffect(() => {
    const container = document.getElementById('scroll');
    const trigger = triggerRef.current;
    if (!container || !trigger) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const size = container.clientHeight;
      const elementPos = trigger.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      const start = elementPos - size;
      const duration = size * 2;
      const progress = duration > 0 ? Math.min(1, Math.max(0, (container.scrollTop - start) / duration)) : 0;
      onProgress(progress);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    container.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      container.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [triggerRef, onProgress]);
}
