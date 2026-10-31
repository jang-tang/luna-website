/**
 * SUIT 웹폰트를 unicode-range 기반 2개 서브셋으로 분할한다 (1회성).
 *
 *   node scripts/subset-fonts.mjs <pyftsubset 경로> <원본 woff2 디렉터리>
 *
 *  - core: 라틴/구두점/한글 자모 + KS X 1001 완성형 한글 2,350자 (대부분의 텍스트)
 *  - ext : 나머지 완성형 한글 (드물게 쓰이는 글자) — 브라우저가 필요할 때만 내려받는다
 *
 * 두 서브셋의 합은 원본 글리프 커버리지와 같으므로 렌더링 결과는 동일하다.
 * pyftsubset 은 fonttools + brotli 가 설치된 Python 환경이 필요하다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [pyftsubset, srcDir] = process.argv.slice(2);
if (!pyftsubset || !srcDir) {
  console.error('usage: node scripts/subset-fonts.mjs <pyftsubset> <srcDir>');
  process.exit(1);
}

const OUT_DIR = 'public/fonts/suit';
const WEIGHTS = { Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800 };

// KS X 1001 완성형 한글: EUC-KR 0xB0A1–0xC8FE
const decoder = new TextDecoder('euc-kr');
const ksHangul = new Set();
for (let hi = 0xb0; hi <= 0xc8; hi++) {
  for (let lo = 0xa1; lo <= 0xfe; lo++) {
    const ch = decoder.decode(new Uint8Array([hi, lo]));
    const cp = ch.codePointAt(0);
    if (cp >= 0xac00 && cp <= 0xd7a3) ksHangul.add(cp);
  }
}

const hex = (cp) => cp.toString(16).toUpperCase().padStart(4, '0');
const toRanges = (cps) => {
  const sorted = [...cps].sort((a, b) => a - b);
  const ranges = [];
  for (const cp of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === cp - 1) last[1] = cp;
    else ranges.push([cp, cp]);
  }
  return ranges.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`));
};

const coreBase = ['U+0000-00FF', 'U+0131', 'U+0152-0153', 'U+02C6', 'U+02DA', 'U+02DC', 'U+2000-206F', 'U+20A9', 'U+20AC', 'U+2122', 'U+2190-21FF', 'U+2212', 'U+3000-303F', 'U+3131-318E', 'U+FF01-FFEF'];
const coreRanges = [...coreBase, ...toRanges(ksHangul)];
const extHangul = [];
for (let cp = 0xac00; cp <= 0xd7a3; cp++) if (!ksHangul.has(cp)) extHangul.push(cp);
const extRanges = toRanges(extHangul);

const css = [];
for (const [name, weight] of Object.entries(WEIGHTS)) {
  const src = path.join(srcDir, `SUIT-${name}.woff2`);
  for (const [subset, ranges] of [['core', coreRanges], ['ext', extRanges]]) {
    const out = path.join(OUT_DIR, `SUIT-${name}.${subset}.woff2`);
    execFileSync(pyftsubset, [src, `--unicodes=${ranges.join(',')}`, '--flavor=woff2', '--layout-features=*', `--output-file=${out}`]);
    css.push(`@font-face {\n  font-family: 'SUIT';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('/fonts/suit/SUIT-${name}.${subset}.woff2') format('woff2');\n  unicode-range: ${ranges.join(', ')};\n}`);
    console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
  }
}
fs.writeFileSync('src/styles/_fonts.scss', `// 자동 생성: scripts/subset-fonts.mjs — 직접 수정하지 말 것\n// SUIT (c) SUNN, SIL Open Font License 1.1 — public/fonts/suit/OFL.txt\n${css.join('\n')}\n`);
console.log('wrote src/styles/_fonts.scss');
