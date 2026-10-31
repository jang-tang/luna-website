/**
 * 정적 디자인 이미지 최적화 (1회성, 재실행 안전).
 *
 *   npm exec tsx scripts/optimize-static-images.ts
 *
 * 원본 PNG/WebP 를 실제 표시 크기의 2배(레티나 대응) 폭으로 리사이즈한 WebP 로 변환한다.
 * 표시 크기는 src/styles/style.scss 의 width/background-size 값을 기준으로 정했다.
 * 원본 파일은 git 이력(커밋 0e83cfa)에 남아 있으므로 변환 후 삭제한다.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const TARGETS: Array<{ src: string; dest: string; width: number; quality: number }> = [
  // #page.future 장식 이미지 (img width 160/430/70/180/280px)
  { src: 'public/img/home/future/luna.png', dest: 'public/img/home/future/luna.webp', width: 320, quality: 90 },
  { src: 'public/img/home/future/hand.png', dest: 'public/img/home/future/hand.webp', width: 860, quality: 90 },
  { src: 'public/img/home/future/circle1.png', dest: 'public/img/home/future/circle1.webp', width: 140, quality: 90 },
  { src: 'public/img/home/future/circle2.png', dest: 'public/img/home/future/circle2.webp', width: 360, quality: 90 },
  { src: 'public/img/home/future/circle3.png', dest: 'public/img/home/future/circle3.webp', width: 560, quality: 90 },
  // 전체 화면 cover 배경
  { src: 'public/img/member/main/background.png', dest: 'public/img/member/main/background.webp', width: 1366, quality: 85 },
  { src: 'public/img/project/main/background.png', dest: 'public/img/project/main/background.webp', width: 2560, quality: 85 },
  // 업적 페이지 로고(460px contain), 홈 업적 카드(background-size 170%)
  { src: 'public/img/award/main.webp', dest: 'public/img/award/main.webp', width: 920, quality: 90 },
  { src: 'public/img/home/award.webp', dest: 'public/img/home/award.webp', width: 1280, quality: 85 },
];

async function main() {
  for (const t of TARGETS) {
    if (!fs.existsSync(t.src)) {
      console.log(`skip (already converted): ${t.src}`);
      continue;
    }
    const input = fs.readFileSync(t.src);
    const meta = await sharp(input).metadata();
    const out = await sharp(input)
      .resize({ width: Math.min(t.width, meta.width ?? t.width), withoutEnlargement: true })
      .webp({ quality: t.quality, alphaQuality: 100, effort: 6 })
      .toBuffer();
    // 같은 경로를 덮어쓰는 경우, 결과가 더 클 때는 원본을 유지한다 (재실행 안전)
    if (t.src === t.dest && out.length >= input.length) {
      console.log(`keep: ${t.src} (${input.length} <= ${out.length})`);
      continue;
    }
    fs.writeFileSync(t.dest, out);
    if (t.src !== t.dest) fs.unlinkSync(t.src);
    console.log(`${t.src} ${meta.width}px ${(input.length / 1024) | 0}KB -> ${t.dest} ${(out.length / 1024) | 0}KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
