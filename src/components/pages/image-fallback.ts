'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/** 사진이 없거나, 불러오는 중이거나, 불러오지 못한 업적·프로젝트 카드에 표시할 루나 로고 */
export const LUNA_LOGO = '/logo/logo-512x512.png';

type CardKind = 'award' | 'project';

// 업적 카드 이미지 영역은 기본 배경이 보라색이라 로고가 묻히므로 밝은 배경 위에 가운데 배치
// 프로젝트 이미지 영역(140px, contain)은 다른 프로젝트 로고와 비슷한 크기로
const LOGO_LAYER: Record<CardKind, { size: string; color?: string }> = {
  award: { size: '72px', color: '#EFEDF8' },
  project: { size: '64%' },
};
const PHOTO_SIZE: Record<CardKind, string> = { award: 'cover', project: 'contain' };

export type ImageStatus = 'loading' | 'loaded' | 'failed';

/**
 * 카드 이미지 영역의 배경 스타일.
 * - 사진 없음 / 실패: 루나 로고만
 * - 불러오는 중: 사진 위에 아직 아무것도 그려지지 않았으므로 아래 층의 루나 로고가 보인다
 * - 완료: 원래처럼 사진만 (로고 층 제거 — 투명한 프로젝트 로고 뒤로 비치지 않게)
 */
export function cardImageStyle(kind: CardKind, image: string | null, status: ImageStatus): CSSProperties {
  const logo = LOGO_LAYER[kind];
  if (!image || status === 'failed') {
    return { backgroundImage: `url('${LUNA_LOGO}')`, backgroundSize: logo.size, backgroundColor: logo.color };
  }
  if (status === 'loaded') return { backgroundImage: `url('${image}')` };
  return {
    backgroundImage: `url('${image}'), url('${LUNA_LOGO}')`,
    backgroundSize: `${PHOTO_SIZE[kind]}, ${logo.size}`,
    backgroundColor: logo.color,
  };
}

/**
 * CSS 배경 이미지는 로드 이벤트가 없으므로, 같은 주소를 Image 객체로 확인해 상태를 돌려준다.
 * (브라우저 캐시를 공유하므로 추가 다운로드는 없다. 이미 받아 둔 사진은 즉시 'loaded')
 */
export function useImageStatus(urls: Array<string | null>): (url: string | null) => ImageStatus {
  const [status, setStatus] = useState<ReadonlyMap<string, ImageStatus>>(() => new Map());
  const key = urls.filter(Boolean).join('|');

  useEffect(() => {
    let active = true;
    const update = (url: string, next: ImageStatus) => {
      if (active) setStatus((prev) => (prev.get(url) === next ? prev : new Map(prev).set(url, next)));
    };
    const images = urls.filter((u): u is string => Boolean(u)).map((url) => {
      const img = new Image();
      img.onload = () => update(url, 'loaded');
      img.onerror = () => update(url, 'failed');
      img.src = url;
      if (img.complete && img.naturalWidth > 0) update(url, 'loaded');
      return img;
    });
    return () => {
      active = false;
      for (const img of images) {
        img.onload = null;
        img.onerror = null;
      }
    };
    // urls 배열은 렌더마다 새로 만들어지므로 내용(key)이 바뀔 때만 다시 확인한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (url) => (url ? (status.get(url) ?? 'loading') : 'failed');
}
