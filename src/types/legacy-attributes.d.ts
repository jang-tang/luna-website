import 'react';

/**
 * 원본 마크업이 CSS 선택자/스크립트에 사용하던 비표준 속성.
 * (예: #content #page[type="full"], .vw[vw="100"], #navbar a[slug="home"])
 */
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 선언 병합을 위해 원본과 같은 제네릭 시그니처가 필요
  interface HTMLAttributes<T> {
    slug?: string;
    vw?: string;
    idx?: string;
    type?: string;
  }
}
