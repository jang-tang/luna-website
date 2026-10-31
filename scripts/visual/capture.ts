/**
 * 화면 캡처 + 레이아웃 시그니처 수집.
 *
 *   node --import tsx scripts/visual/capture-cli.ts <baseUrl> <outDir> [--legacy]
 *
 * 원본 사이트는 body 가 overflow:hidden 이고 #scroll 이 실제 스크롤 컨테이너라
 * Playwright fullPage 캡처가 동작하지 않는다. 그래서 #scroll 을 한 화면씩 내리며 캡처하고,
 * #content 안의 모든 id 요소 rect 를 시그니처로 저장해 구조 비교에 사용한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const;

export const PAGES = [
  { name: 'home', legacy: '/', next: '/' },
  { name: 'member', legacy: '/member.html', next: '/member.html' },
  { name: 'award', legacy: '/award.html', next: '/award.html' },
  { name: 'project', legacy: '/project.html', next: '/project.html' },
  { name: 'qna', legacy: '/qna.html', next: '/qna.html' },
] as const;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  // #scroll fade-in(.5s) + 3D 모델 로딩 여유
  await page.waitForTimeout(1500);
}

async function signature(page: Page) {
  return page.evaluate(() => {
    const out: Array<{ path: string; x: number; y: number; w: number; h: number; text?: string }> = [];
    const scroll = document.querySelector('#scroll') as HTMLElement | null;
    const top = scroll?.scrollTop ?? 0;
    const pathOf = (el: Element) => {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur.id !== 'content' && cur !== document.body) {
        const idx = cur.parentElement ? Array.from(cur.parentElement.children).indexOf(cur) : 0;
        parts.unshift(`${cur.tagName.toLowerCase()}#${cur.id || '-'}${cur.className && typeof cur.className === 'string' ? '.' + cur.className.split(' ').join('.') : ''}[${idx}]`);
        cur = cur.parentElement;
      }
      return parts.join('>');
    };
    for (const el of Array.from(document.querySelectorAll('#app [id], #app iframe, #app img'))) {
      const r = el.getBoundingClientRect();
      const leaf = el.children.length === 0;
      out.push({
        path: pathOf(el),
        x: Math.round(r.x),
        y: Math.round(r.y + top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        ...(leaf ? { text: (el.textContent || '').trim().slice(0, 80) } : {}),
      });
    }
    return out;
  });
}

export async function capture(baseUrl: string, outDir: string, mode: 'legacy' | 'next') {
  fs.mkdirSync(outDir, { recursive: true });
  // CAPTURE_CHANNEL=chrome 이면 설치된 Google Chrome 사용 (headless shell 이 WebGL 페이지에서 불안정할 때)
  // WebGL(3D 모델) 페이지에서 headless 브라우저의 GPU 경로가 불안정해 소프트웨어 렌더링(SwiftShader)을 사용한다
  const browser = await chromium.launch({
    ...(process.env.CAPTURE_CHANNEL ? { channel: process.env.CAPTURE_CHANNEL } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const summary: Record<string, unknown> = {};
  try {
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
      // tsx(esbuild keepNames) 가 evaluate 함수에 __name 헬퍼를 주입하므로 페이지에 shim 을 둔다
      await context.addInitScript("window.__name = (f) => f");
      for (const p of PAGES) {
        const page = await context.newPage();
        page.on('crash', () => console.error(`page crashed: ${vpName} ${p.name}`));
        console.error(`capture: ${vpName} ${p.name}`);
        await page.goto(baseUrl + p[mode], { waitUntil: 'load' });
        await settle(page);
        // Q&A 아코디언 첫 항목을 열어 인터랙션 결과도 비교
        if (p.name === 'qna') {
          await page.locator('#page.qna #item #q').first().click();
          await page.waitForTimeout(300);
        }
        const scrollHeight = await page.evaluate(() => (document.querySelector('#scroll') as HTMLElement).scrollHeight);
        const clientHeight = await page.evaluate(() => (document.querySelector('#scroll') as HTMLElement).clientHeight);
        const shots: string[] = [];
        for (let y = 0, i = 0; y < scrollHeight && i < 30; y += clientHeight, i++) {
          await page.evaluate((top) => { (document.querySelector('#scroll') as HTMLElement).scrollTop = top; }, y);
          await page.waitForTimeout(250);
          const file = `${vpName}-${p.name}-${String(i).padStart(2, '0')}.png`;
          await page.screenshot({ path: path.join(outDir, file) });
          shots.push(file);
        }
        await page.evaluate(() => { (document.querySelector('#scroll') as HTMLElement).scrollTop = 0; });
        await page.waitForTimeout(200);
        const sig = await signature(page);
        fs.writeFileSync(path.join(outDir, `${vpName}-${p.name}.json`), JSON.stringify(sig, null, 1));
        summary[`${vpName}-${p.name}`] = { scrollHeight, shots: shots.length, elements: sig.length };
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
  return summary;
}

