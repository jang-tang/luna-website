/**
 * 원본 각 페이지 하단의 jQuery 레이아웃 스크립트를 바닐라 JS 로 옮긴 것 (동작 동일).
 *
 * - 폭 750px 이하에서는 body 를 750px 기준으로 scale 하여 축소 표시
 * - #app 크기, [type=full] 페이지 높이, [type=min] 최소 높이, .vw 요소 폭을 계산
 * - DOMContentLoaded 시 #scroll 에 loaded 클래스를 붙여 페이드인
 *
 * React 하이드레이션 전에 실행되어야 레이아웃 이동(CLS)과 깜빡임이 없으므로
 * 루트 레이아웃에서 #app 마크업 바로 뒤에 인라인 <script> 로 삽입한다.
 * React 컴포넌트는 window.__luna.resize() 로 재계산을 요청할 수 있다.
 */
export const LAYOUT_SCRIPT = `(function () {
  var showWidth = 0, showHeight = 0, checkScale = true, listening = false;
  var px = function (el, prop) { return parseFloat(getComputedStyle(el)[prop]) || 0; };
  var setScale = function (scale) {
    var b = document.body;
    b.style.transform = 'scale(' + scale + ')';
    b.style.width = (1 / scale * 100) + '%';
    b.style.height = (1 / scale * 100) + '%';
    checkScale = false;
    window.dispatchEvent(new Event('resize'));
  };
  var resize = function () {
    var body = document.body, app = document.getElementById('app');
    if (!app) return;
    showWidth = px(body, 'width');
    showHeight = px(body, 'height');
    app.style.width = showWidth + 'px';
    app.style.height = Math.ceil(showHeight) + 'px';
    var navbar = document.getElementById('navbar');
    var navHeight = navbar ? px(navbar, 'height') : 0;
    var pages = document.querySelectorAll('#content #page');
    for (var i = 0; i < pages.length; i++) {
      var type = pages[i].getAttribute('type');
      if (type === 'full') pages[i].style.height = (showHeight - navHeight) + 'px';
      else if (type === 'min') pages[i].style.minHeight = (showHeight - navHeight) + 'px';
    }
    var vws = document.querySelectorAll('.vw');
    for (var j = 0; j < vws.length; j++) vws[j].style.width = (showWidth * Number(vws[j].getAttribute('vw')) / 100) + 'px';
    if (checkScale) {
      if (showWidth <= 750) setScale(document.documentElement.clientWidth / 750);
      else setScale(1);
    } else {
      checkScale = true;
    }
  };
  window.__luna = {
    resize: resize,
    getShowWidth: function () { return showWidth; },
    getShowHeight: function () { return showHeight; }
  };
  resize();
  if (!listening) { window.addEventListener('resize', resize); listening = true; }
  resize();
  var ready = function () { var s = document.getElementById('scroll'); if (s) s.classList.add('loaded'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();`;

declare global {
  interface Window {
    __luna?: { resize: () => void; getShowWidth: () => number; getShowHeight: () => number };
  }
}
