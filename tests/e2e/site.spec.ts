import { expect, test } from '@playwright/test';

const PAGES = [
  { path: '/', slug: 'home' },
  { path: '/member.html', slug: 'member' },
  { path: '/award.html', slug: 'award' },
  { path: '/project.html', slug: 'project' },
  { path: '/qna.html', slug: 'qna' },
];

test.describe('기존 라우팅과 레이아웃', () => {
  for (const p of PAGES) {
    test(`${p.path} 정상 표시 + 내비게이션 활성 항목`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // 우리 출처에서 발생한 오류만 수집 (유튜브 iframe 내부 콘솔 메시지 제외)
      page.on('console', (m) => m.type() === 'error' && m.location().url.startsWith(new URL(page.url() || 'http://x').origin) && errors.push(m.text()));
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.locator(`#app.${p.slug}`)).toBeVisible();
      await expect(page.locator('#scroll')).toHaveClass(/loaded/);
      await expect(page.locator(`#navbar a[slug="${p.slug}"]`)).toHaveClass(/active/);
      await expect(page.locator('#footer #cc')).toHaveText('Copyright © 2024 LUNA All rights reserved.');
      expect(errors).toEqual([]);
    });
  }

  test('확장자 없는 경로(/member 등)와 /index.html 도 동작하고, 없는 페이지는 404', async ({ page, request }) => {
    for (const path of ['/member', '/award', '/project', '/qna', '/index.html']) expect((await request.get(path)).status()).toBe(200);
    const res = await page.goto('/does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('페이지를 찾을 수 없습니다')).toBeVisible();
  });

  test('750px 이하에서는 원본처럼 body 를 750px 기준으로 축소한다', async ({ page }, info) => {
    await page.goto('/');
    const transform = await page.evaluate(() => document.body.style.transform);
    if (info.project.name === 'mobile') expect(transform).toMatch(/^scale\(0\.\d+\)$/);
    else expect(transform).toBe('scale(1)');
  });
});

test.describe('인터랙션', () => {
  test('멤버: 기수 탭 전환 시 제목과 카드가 바뀐다', async ({ page }) => {
    await page.goto('/member.html');
    const tabs = page.locator('#page.member #category #item');
    await expect(tabs.first()).toHaveClass(/active/);
    const second = tabs.nth(1);
    const name = (await second.textContent())!;
    await second.click();
    await expect(second).toHaveClass(/active/);
    await expect(page.locator('#page.member > #inner > #title')).toHaveText(name);
    await expect(page.locator('#page.member #member #item').first()).toBeVisible();
  });

  test('업적: 연도 탭 전환 시 "N년의 LUNA" 와 카드가 바뀐다', async ({ page }) => {
    await page.goto('/award.html');
    const tabs = page.locator('#page.award #category #item');
    const last = tabs.last();
    const year = (await last.getAttribute('idx'))!;
    await last.click();
    await expect(page.locator('#page.award #title #number')).toHaveText(year);
    await expect(page.locator('#page.award #award #item #name').first()).not.toBeEmpty();
  });

  test('프로젝트: 연도 탭이 상단 제목 연도에도 반영된다', async ({ page }) => {
    await page.goto('/project.html');
    const tab = page.locator('#page.project #category #item').nth(2);
    const year = (await tab.getAttribute('idx'))!;
    await tab.click();
    await expect(page.locator('#page.main #number')).toHaveText(year);
    await expect(page.locator('#page.project #title #number')).toHaveText(year);
  });

  test('Q&A: 질문 클릭 시 답변이 열리고 다시 클릭하면 닫힌다', async ({ page }) => {
    await page.goto('/qna.html');
    const item = page.locator('#page.qna #item').first();
    const answer = item.locator('#a');
    await expect(answer).toHaveCSS('height', '0px');
    await item.locator('#q').click();
    await expect(item).toHaveClass(/active/);
    expect(parseFloat(await answer.evaluate((el) => getComputedStyle(el).height))).toBeGreaterThan(0);
    await item.locator('#q').click();
    await expect(item).not.toHaveClass(/active/);
  });

  test('"스크롤하여 더 알아보기" 클릭 시 한 화면 아래로 부드럽게 스크롤', async ({ page }) => {
    await page.goto('/member.html');
    await page.locator('#page.main #detail').click();
    await page.waitForTimeout(1300);
    const top = await page.evaluate(() => (document.querySelector('#scroll') as HTMLElement).scrollTop);
    expect(top).toBeGreaterThan(300);
  });

  test('멤버/프로젝트 페이지: 스크롤하면 내비게이션 glass 해제, 맨 위로 오면 복귀', async ({ page }) => {
    await page.goto('/project.html');
    const navbar = page.locator('#navbar');
    await expect(navbar).toHaveClass(/glass/);
    await page.evaluate(() => ((document.querySelector('#scroll') as HTMLElement).scrollTop = 400));
    await expect(navbar).not.toHaveClass(/glass/);
    await page.evaluate(() => ((document.querySelector('#scroll') as HTMLElement).scrollTop = 0));
    await expect(navbar).toHaveClass(/glass/);
  });

  test('홈: 태그 줄이 화면 폭 이상으로 채워지고 스크롤에 따라 이동한다', async ({ page }) => {
    await page.goto('/');
    const mix = page.locator('#page.project #tags #line[idx="0"] #mix');
    const widths = await page.evaluate(() => ({
      mix: (document.querySelector('#page.project #tags #line #mix') as HTMLElement).offsetWidth,
      app: (document.getElementById('app') as HTMLElement).offsetWidth,
    }));
    expect(widths.mix).toBeGreaterThan(widths.app);
    const before = await mix.evaluate((el) => el.style.transform);
    await page.evaluate(() => ((document.querySelector('#scroll') as HTMLElement).scrollTop = 600));
    await expect.poll(() => mix.evaluate((el) => el.style.transform)).not.toBe(before);
  });

  test('홈: 3D 모델 캔버스가 지연 로딩 후 렌더링된다', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    await expect.poll(async () => page.evaluate(() => (document.getElementById('luna3d') as HTMLCanvasElement).width), { timeout: 15_000 }).toBe(600);
  });
});

test.describe('API / 보안', () => {
  test('동기화·상태·무효화 엔드포인트는 인증 없이 401', async ({ request }) => {
    for (const [method, path] of [['GET', '/api/cron/sync'], ['POST', '/api/cron/sync'], ['GET', '/api/sync/status'], ['POST', '/api/revalidate']] as const) {
      const res = await request.fetch(path, { method, headers: { authorization: 'Bearer wrong-secret' } });
      expect(res.status(), `${method} ${path}`).toBe(401);
      expect(await res.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
    }
  });

  test('관리 페이지는 Basic 인증 필요', async ({ request }) => {
    const res = await request.get('/admin/sync');
    expect([401, 404]).toContain(res.status());
  });

  test('헬스체크와 미디어 캐시 헤더', async ({ request, page }) => {
    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, db: 'up' });

    await page.goto('/member.html');
    const style = await page.locator('#page.member #member #item #image').first().getAttribute('style');
    const src = style?.match(/url\(([^)]+)\)/)?.[1]?.replace(/['"]/g, '');
    expect(src).toMatch(/^\/media\/[0-9a-f]{32}\.webp$|default\.svg$/);
    if (src?.startsWith('/media/')) {
      const img = await request.get(src);
      expect(img.status()).toBe(200);
      expect(img.headers()['content-type']).toBe('image/webp');
      expect(img.headers()['cache-control']).toContain('immutable');
    }
    expect((await request.get('/media/not-a-hash.webp')).status()).toBe(404);
  });

  test('보안 헤더', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });
});
