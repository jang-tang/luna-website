/**
 * 원본/신규 캡처 비교.
 *   tsx scripts/visual/compare.ts <baselineDir> <candidateDir> <diffDir>
 *
 * 1) 레이아웃 시그니처: 요소별 위치/크기(±1px 허용)와 텍스트 비교
 * 2) 픽셀 비교: 3D 캔버스(#luna3d)와 유튜브 iframe 영역은 비결정적이므로 마스킹 후 비교
 */
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

type Sig = { path: string; x: number; y: number; w: number; h: number; text?: string };

// Next.js 는 body 앞쪽에 숨김 div(메타데이터 스트리밍용)를 넣으므로 #app 의 형제 인덱스는 비교에서 제외
// 원본은 #content 안에 <script> 태그가 섞여 있어 #footer 의 형제 인덱스가 다르다 → 역시 제외
const normalize = (sigs: Sig[]) =>
  sigs.map((s) => ({ ...s, path: s.path.replace(/^(div#app\.\w+)\[\d+\]/, '$1').replace(/div#footer\[\d+\]/, 'div#footer') }));
// CSS 무한 애니메이션(bounce) 요소는 캡처 시점마다 위치가 달라 rect 비교에서 제외
const ANIMATED = /div#page\.future\[\d+\]>div#inner\[0\]>div#box\[0\]>div#image\./;

const [baseDir, candDir, diffDir] = process.argv.slice(2);
if (!baseDir || !candDir || !diffDir) {
  console.error('usage: tsx scripts/visual/compare.ts <baselineDir> <candidateDir> <diffDir>');
  process.exit(1);
}
fs.mkdirSync(diffDir, { recursive: true });

// 시그니처 경로의 마지막 세그먼트 형식: tag#id.class[index]
const MASK_PATTERN = /^(canvas#luna3d|iframe#-)[.\[]/;
const results: Array<Record<string, unknown>> = [];

for (const sigFile of fs.readdirSync(baseDir).filter((f) => f.endsWith('.json') && f !== 'summary.json').sort()) {
  const name = sigFile.replace('.json', '');
  const base: Sig[] = normalize(JSON.parse(fs.readFileSync(path.join(baseDir, sigFile), 'utf8')));
  const candPath = path.join(candDir, sigFile);
  if (!fs.existsSync(candPath)) {
    results.push({ name, error: 'missing candidate' });
    continue;
  }
  const cand: Sig[] = normalize(JSON.parse(fs.readFileSync(candPath, 'utf8')));

  // 1) 시그니처
  const index = new Map(cand.map((s) => [s.path, s]));
  const layoutDiffs: string[] = [];
  for (const b of base) {
    const c = index.get(b.path);
    if (!c) {
      layoutDiffs.push(`missing ${b.path}`);
      continue;
    }
    const moved = !ANIMATED.test(b.path) && (Math.abs(b.x - c.x) > 1 || Math.abs(b.y - c.y) > 1 || Math.abs(b.w - c.w) > 1 || Math.abs(b.h - c.h) > 1);
    if (moved) layoutDiffs.push(`rect ${b.path} ${b.x},${b.y} ${b.w}x${b.h} -> ${c.x},${c.y} ${c.w}x${c.h}`);
    if ((b.text ?? '') !== (c.text ?? '')) layoutDiffs.push(`text ${b.path} "${b.text}" -> "${c.text}"`);
  }
  const extra = cand.filter((c) => !base.some((b) => b.path === c.path)).map((c) => `extra ${c.path}`);
  layoutDiffs.push(...extra);

  // 마스크 영역 (원본 시그니처 기준, 문서 좌표)
  const masks = base.filter((s) => MASK_PATTERN.test(s.path.split('>').pop() ?? ''));

  // 2) 픽셀
  let maxRatio = 0;
  let worst = '';
  for (const shot of fs.readdirSync(baseDir).filter((f) => f.startsWith(name + '-') && f.endsWith('.png'))) {
    const candShot = path.join(candDir, shot);
    if (!fs.existsSync(candShot)) {
      layoutDiffs.push(`missing screenshot ${shot}`);
      continue;
    }
    const a = PNG.sync.read(fs.readFileSync(path.join(baseDir, shot)));
    const b = PNG.sync.read(fs.readFileSync(candShot));
    if (a.width !== b.width || a.height !== b.height) {
      layoutDiffs.push(`size ${shot}`);
      continue;
    }
    const scrollIndex = Number(shot.match(/-(\d+)\.png$/)![1]);
    const dpr = a.width / Number(name.startsWith('desktop') ? 1440 : name.startsWith('tablet') ? 820 : 390);
    const viewportH = a.height / dpr;
    for (const m of masks) {
      // 모바일은 body scale 이 적용되어 있어 시그니처(레이아웃 좌표)와 화면 좌표가 다르다 → 넉넉히 마스킹
      const scale = name.startsWith('mobile') ? 390 / 750 : 1;
      const top = (m.y * scale - scrollIndex * viewportH) * dpr;
      const x0 = Math.max(0, Math.floor((m.x - 10) * dpr));
      const y0 = Math.max(0, Math.floor(top - 10 * dpr));
      const x1 = Math.min(a.width, Math.ceil((m.x + m.w * scale + 10) * dpr));
      const y1 = Math.min(a.height, Math.ceil(top + (m.h * scale + 10) * dpr));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * a.width + x) * 4;
          for (let k = 0; k < 4; k++) b.data[i + k] = a.data[i + k]!;
        }
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const count = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    const ratio = count / (a.width * a.height);
    if (ratio > 0.001) fs.writeFileSync(path.join(diffDir, shot), PNG.sync.write(diff));
    if (ratio > maxRatio) {
      maxRatio = ratio;
      worst = shot;
    }
  }
  results.push({ name, layoutDiffs: layoutDiffs.length, maxPixelDiff: `${(maxRatio * 100).toFixed(2)}%`, worst, sample: layoutDiffs.slice(0, 3).join(' | ') });
}

console.table(results);
fs.writeFileSync(path.join(diffDir, 'report.json'), JSON.stringify(results, null, 2));
