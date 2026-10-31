'use client';

import { useEffect } from 'react';

/** 원본: 스크롤 위치가 0 이면 #navbar 에 glass, 아니면 해제 */
export function NavbarGlass() {
  useEffect(() => {
    const scroll = document.getElementById('scroll');
    const navbar = document.getElementById('navbar');
    if (!scroll || !navbar) return;
    const onScroll = () => navbar.classList.toggle('glass', scroll.scrollTop === 0);
    onScroll();
    scroll.addEventListener('scroll', onScroll, { passive: true });
    return () => scroll.removeEventListener('scroll', onScroll);
  }, []);
  return null;
}
