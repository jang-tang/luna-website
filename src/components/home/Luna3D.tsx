'use client';

import { useEffect, useRef } from 'react';
import { CANVAS_SIZE } from './luna3d-scene';

const POINTER_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout'];

/**
 * 메인 3D 달 모델 (원본 utils.home.js init3d/onMove 와 동일).
 * three.js + Spline 로더(~1MB)는 초기 렌더링·하이드레이션을 막지 않도록 load 이후 유휴 시간에 동적 import 한다.
 *
 * 참고: OffscreenCanvas + Web Worker 렌더링도 시도했으나, Spline 로더가 document 가 없는 환경에서
 * 이미지 텍스처 로딩을 건너뛰어(유리 구체가 흰색으로 렌더링) 원본과 화면이 달라지므로 채택하지 않았다.
 */
export function Luna3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let rotate: ((x: number, y: number) => void) | null = null;
    let cleanup: (() => void) | undefined;
    let eventX: number | undefined;
    let eventY: number | undefined;

    // 원본 onMove: 마지막 포인터 위치를 기준으로 캔버스 중심에서의 오프셋을 계산
    const onMove = (e: Event) => {
      if ('touches' in e) {
        const te = e as TouchEvent;
        const touch = te.touches[0] || te.changedTouches[0];
        if (touch) {
          eventX = touch.pageX;
          eventY = touch.pageY;
        }
      } else if ('clientX' in e) {
        eventX = (e as MouseEvent).clientX;
        eventY = (e as MouseEvent).clientY;
      }
      if (eventX === undefined || eventY === undefined || !rotate) return;
      const rect = canvas.getBoundingClientRect();
      rotate(eventX - rect.left - CANVAS_SIZE / 2, eventY - rect.top - CANVAS_SIZE / 2);
    };
    POINTER_EVENTS.forEach((type) => document.addEventListener(type, onMove, { passive: true }));
    const scroll = document.getElementById('scroll');
    scroll?.addEventListener('scroll', onMove, { passive: true });

    const start = async () => {
      const { createLunaScene } = await import('./luna3d-scene');
      if (disposed) return;
      const scene = await createLunaScene(canvas);
      if (disposed) return scene.dispose();
      rotate = scene.rotate;
      cleanup = scene.dispose;
    };

    const schedule = () => {
      const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1));
      idle(() => void start());
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      disposed = true;
      window.removeEventListener('load', schedule);
      POINTER_EVENTS.forEach((type) => document.removeEventListener(type, onMove));
      scroll?.removeEventListener('scroll', onMove);
      cleanup?.();
    };
  }, []);

  return <canvas id="luna3d" ref={canvasRef}></canvas>;
}
