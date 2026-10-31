/**
 * 타이밍 공격을 피하기 위한 상수 시간 문자열 비교.
 * node:crypto 에 의존하지 않아 proxy(미들웨어) 런타임에서도 사용할 수 있다.
 */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
