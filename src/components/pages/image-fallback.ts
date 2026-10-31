'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/** 사진이 없거나 불러오지 못한 업적·프로젝트 카드에 표시할 루나 로고 */
export const LUNA_LOGO = '/logo/logo-512x512.png';

// 업적 카드 이미지 영역은 기본 배경이 보라색이라 로고가 묻히므로 밝은 배경 위에 가운데 배치
export const AWARD_IMAGE_FALLBACK: CSSProperties = {
  backgroundImage: `url('${LUNA_LOGO}')`,
  backgroundColor: '#EFEDF8',
  backgroundSize: '72px',
};

// 프로젝트 이미지 영역(140px, contain)은 다른 프로젝트 로고와 비슷한 크기로
export const PROJECT_IMAGE_FALLBACK: CSSProperties = {
  backgroundImage: `url('${LUNA_LOGO}')`,
  backgroundSize: '64%',
};

/**
 * CSS 배경 이미지는 로드 실패 이벤트가 없으므로, 같은 주소를 Image 객체로 한 번 더 확인해
 * 실패한 주소 목록을 돌려준다. (브라우저 캐시를 공유하므로 추가 다운로드는 거의 없다)
 */
export function useFailedImages(urls: Array<string | null>): ReadonlySet<string> {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const key = urls.filter(Boolean).join('|');

  useEffect(() => {
    let active = true;
    const images = urls.filter((u): u is string => Boolean(u)).map((url) => {
      const img = new Image();
      img.onerror = () => {
        if (active) setFailed((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
      };
      img.src = url;
      return img;
    });
    return () => {
      active = false;
      for (const img of images) img.onerror = null;
    };
    // urls 배열은 렌더마다 새로 만들어지므로 내용(key)이 바뀔 때만 다시 확인한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return failed;
}
