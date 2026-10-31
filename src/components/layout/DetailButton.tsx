'use client';

/** "스크롤하여 더 알아보기": 원본 $('#scroll').animate({scrollTop: showHeight}, 1000) (jQuery swing easing) */
export function DetailButton() {
  const onClick = () => {
    const scroll = document.getElementById('scroll');
    if (!scroll) return;
    const from = scroll.scrollTop;
    const to = window.__luna?.getShowHeight() ?? window.innerHeight;
    const started = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / 1000);
      const eased = 0.5 - Math.cos(p * Math.PI) / 2;
      scroll.scrollTop = from + (to - from) * eased;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  return (
    <div id="detail" onClick={onClick}>
      <div id="icon"></div>
      <div id="text">스크롤하여 더 알아보기</div>
    </div>
  );
}
