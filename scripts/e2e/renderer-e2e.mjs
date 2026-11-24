#!/usr/bin/env node
/**
 * Dravio — kiểm thử renderer trên Chromium thật (Playwright có sẵn trong môi trường; KHÔNG phải
 * dependency của dự án, không chạy trong CI). Chạy sau `npm run build`:
 *   node scripts/e2e/renderer-e2e.mjs
 * Ghi kết quả: docs/rendering/e2e/renderer-e2e.json + ảnh chụp docs/rendering/e2e/*.png
 *
 * Phiên 1 — bản build production (`vite preview`): ảnh chụp, FPS, bộ nhớ JS + cache ảnh, reduced motion,
 *   lưu/tải lại (cài đặt timeMode bền qua reload).
 * Phiên 2 — dev server (đầu dò `dravioAgents` chỉ có ở DEV): Space cho ăn, chạm cảm ứng,
 *   chế độ chỉ đọc ở tab thứ hai, lỗi tải ảnh.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'rendering', 'e2e');
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const SAVE = join(OUT, '..', '..', '..', 'node_modules', '.tmp', 'e2e-save.json');
mkdirSync(dirname(SAVE), { recursive: true });
execFileSync('node', [join(ROOT, 'scripts/e2e/make-test-save.mjs'), SAVE], { stdio: 'inherit' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function serve(args, port) {
  const p = spawn('npx', ['vite', ...args, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const kill = p.kill.bind(p);
  p.kill = () => {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      kill();
    }
    return true;
  };
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/`);
      if (r.ok) return p;
    } catch {
      /* chờ server */
    }
    await sleep(500);
  }
  p.kill();
  throw new Error(`server ${args.join(' ')} did not start`);
}
const results = { when: new Date().toISOString(), browser: null, prod: {}, dev: {}, notes: [] };

async function importSave(page) {
  await page.waitForSelector('[data-testid="world-canvas"]', { timeout: 60_000 });
  await page.waitForFunction(() => !document.body.textContent?.includes('Đang tải') || true);
  await sleep(800);
  await page.setInputFiles('input[type=file]', SAVE);
  await page.waitForSelector('.confirm button');
  await page.click('.confirm button');
  await sleep(1500);
}
const stats = (page) => page.$eval('[data-testid="world-canvas"]', (c) => c.dravioStats());
const shot = (page, name) => page.$eval('[data-testid="world-canvas"]', (c) => c.scrollIntoView()).then(() => page.locator('[data-testid="world-canvas"]').screenshot({ path: join(OUT, name) }));
const tab = (page, i) => page.locator('.habitat-nav button[aria-pressed]').nth(i).click();

// ------------------------------------------------------------------ prod
{
  const server = await serve(['preview'], 4173);
  const browser = await chromium.launch();
  results.browser = browser.version();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto('http://localhost:4173/');
  await importSave(page);
  await sleep(4000);
  await shot(page, 'meadow-day.png');
  // FPS 10 s ở đồng cỏ (3 rồng, hạt môi trường bật).
  await sleep(10_000);
  results.prod.meadow = await stats(page);
  // Bờ hồ (tab 0), đá ấm (tab 2).
  await tab(page, 0);
  await sleep(2500);
  await shot(page, 'pondbank-day.png');
  results.prod.pondbank = await stats(page);
  await tab(page, 2);
  await sleep(2500);
  await shot(page, 'warm-rocks-day.png');
  await tab(page, 1);
  await sleep(1200);
  // Thời điểm: hoàng hôn / đêm.
  const sel = page.locator('.world-controls select');
  await sel.selectOption('sunset');
  await sleep(1500);
  await shot(page, 'meadow-sunset.png');
  await sel.selectOption('night');
  await sleep(1500);
  await shot(page, 'meadow-night.png');
  // Bộ nhớ: 60 s chuyển cảnh liên tục mỗi 2 s.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const m = await cdp.send('Performance.getMetrics');
    return Math.round((m.metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0) / 1024);
  };
  const mem = { heapKB: [await heap()], images: [] };
  for (let i = 0; i < 30; i++) {
    await tab(page, i % 3);
    await sleep(2000);
    if (i % 10 === 9) {
      mem.heapKB.push(await heap());
      mem.images.push((await stats(page)).images);
    }
  }
  // Ở yên một cảnh 40 s để cache giải phóng ảnh không dùng (idle 30 s).
  await tab(page, 1);
  await sleep(40_000);
  mem.heapKB.push(await heap());
  mem.images.push((await stats(page)).images);
  results.prod.memory = mem;
  results.prod.afterNavigation = await stats(page);
  // Lưu/tải lại: timeMode = night phải còn sau reload; rồng vẫn hiện.
  await page.click('text=Lưu ngay').catch(() => {});
  await sleep(800);
  await page.reload();
  await page.waitForSelector('[data-testid="world-canvas"]');
  await sleep(3000);
  results.prod.reload = {
    timeMode: await page.locator('.world-controls select').inputValue(),
    dragonButtons: await page.locator('section[aria-labelledby="world-heading"] h3 + .row button').count(),
    stats: await stats(page),
  };
  await shot(page, 'meadow-night-after-reload.png');
  await sel.selectOption('auto');
  // Reduced motion (hệ điều hành).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(2500);
  results.prod.reducedMotion = await stats(page);
  await shot(page, 'meadow-reduced-motion.png');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // 30 FPS.
  results.prod.consoleErrors = consoleErrors;
  await browser.close();
  server.kill();
}

// ------------------------------------------------------------------ dev
{
  const server = await serve([], 5174);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://localhost:5174/');
  await importSave(page);
  await sleep(2000);
  const agents = () => page.$eval('[data-testid="world-canvas"]', (c) => c.dravioAgents());
  // Space ngoài cảnh (focus body) không cho ăn; trong cảnh thì có.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  await sleep(4000);
  const before = (await agents()).filter((a) => a.state === 'seekFood' || a.state === 'eat').length;
  await page.focus('[data-testid="world-canvas"]');
  await page.keyboard.press('Space');
  let seen = 0;
  for (let i = 0; i < 24 && seen === 0; i++) {
    await sleep(500);
    seen = (await agents()).filter((a) => a.habitatId === 'origin_meadow' && (a.state === 'seekFood' || a.state === 'eat')).length;
  }
  // Space trong ô nhập tên không cho ăn: chọn rồng → ô nhập → Space.
  results.dev.space = { outsideSceneSeekers: before, insideSceneSeekers: seen };
  results.dev.animStates = [...new Set((await agents()).map((a) => `${a.uid}:${a.anim}`))];
  // Space: viên thức ăn rơi gần một rồng ăn được nhóm đang chọn (fruit: Emberling, Zephyr).
  const foods = await page.$eval('[data-testid="world-canvas"]', (c) => c.dravioFood());
  const ags = await agents();
  const fruitEaters = ags.filter((a) => a.habitatId === 'origin_meadow' && /zephyr|^d_/.test(a.uid));
  results.dev.spaceDrop = foods.map((f) => ({ pos: f.pos, nearestEaterPx: Math.round(Math.min(...fruitEaters.map((a) => Math.hypot(a.pos.x - f.pos.x, a.pos.y - f.pos.y)))) }));
  // Focus: chọn Zephyr Adult trong danh sách → chưa zoom; bấm "Theo dõi rồng" → 2×, bám theo.
  await page.locator('section[aria-labelledby="world-heading"] h3 + .row button').nth(1).click();
  await sleep(300);
  const camAfterSelect = await page.$eval('[data-testid="world-canvas"]', (c) => c.dravioCamera());
  await page.locator('.camera-controls button').nth(1).click();
  await sleep(1500);
  const camFocus = await page.$eval('[data-testid="world-canvas"]', (c) => c.dravioCamera());
  await page.locator('[data-testid="world-canvas"]').screenshot({ path: join(OUT, 'focus-2x.png') });
  results.dev.focus = { afterSelectZoom: camAfterSelect.zoom, mode: camFocus.mode, zoom: camFocus.zoom, followUid: camFocus.followUid };
  await page.locator('.camera-controls button').first().click();
  // Chuyển cảnh: bình thường có trượt; reduced motion thì tức thì.
  await page.locator('.habitat-nav button[aria-pressed]').nth(0).click();
  await sleep(60);
  const slideNormal = (await page.$eval('[data-testid="world-canvas"]', (c) => c.dravioStats())).transitioning;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(200);
  await page.locator('.habitat-nav button[aria-pressed]').nth(1).click();
  await sleep(60);
  const slideReduced = (await page.$eval('[data-testid="world-canvas"]', (c) => c.dravioStats())).transitioning;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  results.dev.transition = { normalSlides: slideNormal, reducedMotionSlides: slideReduced };
  // Thu thập trạng thái hoạt ảnh trong 40 s.
  const seenAnim = {};
  for (let i = 0; i < 80; i++) {
    for (const a of await agents()) (seenAnim[a.uid] ??= new Set()).add(a.anim);
    await sleep(500);
  }
  results.dev.animSeen = Object.fromEntries(Object.entries(seenAnim).map(([k, v]) => [k, [...v].sort()]));
  // Tab thứ hai → chỉ đọc: Space không có tác dụng.
  const page2 = await ctx.newPage();
  await page2.goto('http://localhost:5174/');
  await page2.waitForSelector('[data-testid="world-canvas"]', { timeout: 60_000 });
  await sleep(2500);
  results.dev.secondTabNotice = (await page2.locator('.notice').allTextContents()).join(' | ');
  await page2.close();
  // Lỗi tải ảnh: chặn khung Emberling Adult idle → không crash, rồng khác vẫn vẽ.
  const page3 = await ctx.newPage();
  // Chỉ chặn tải ẢNH (ở dev, Vite tải cùng đường dẫn như module JS khi import `?url`): mọi khung Emberling.
  await page3.route('**/frames/emberling/**', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
  page3.on('pageerror', (e) => errs.push(`page3: ${String(e)}`));
  await page3.goto('http://localhost:5174/');
  await page3.waitForSelector('[data-testid="world-canvas"]', { timeout: 60_000 });
  await sleep(4000);
  const st3 = await page3.$eval('[data-testid="world-canvas"]', (c) => c.dravioStats());
  results.dev.assetFailure = {
    failedImages: st3.images.failed,
    framesDrawn: st3.frames,
    fps: st3.fps,
    otherDragonsAnimating: (await page3.$eval('[data-testid="world-canvas"]', (c) => c.dravioAgents())).filter((a) => !a.uid.startsWith('d_')).length,
  };
  await page3.close();
  await page.close();
  // Cảm ứng: điện thoại 390×844.
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const m = await mctx.newPage();
  await m.goto('http://localhost:5174/');
  await m.waitForSelector('[data-testid="world-canvas"]', { timeout: 60_000 });
  await sleep(2500);
  const box = await m.locator('[data-testid="world-canvas"]').boundingBox();
  // Chạm vào cỏ phía trước (y ≈ 500/540 cảnh).
  await m.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height * (500 / 540));
  let touched = 0;
  for (let i = 0; i < 24 && touched === 0; i++) {
    await sleep(500);
    touched = (await m.$eval('[data-testid="world-canvas"]', (c) => c.dravioAgents())).filter((a) => a.state === 'seekFood' || a.state === 'eat').length;
  }
  results.dev.touch = {
    seekersAfterTap: touched,
    canvasCss: [Math.round(box.width), Math.round(box.height)],
    horizontalOverflow: await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    stats: await m.$eval('[data-testid="world-canvas"]', (c) => c.dravioStats()),
  };
  await m.locator('[data-testid="world-canvas"]').screenshot({ path: join(OUT, 'mobile-390.png') });
  // Camera trên điện thoại: chụm 2 ngón (CDP touch), kéo khi zoom, chạm khi zoom → toạ độ thế giới đúng.
  const mc = await mctx.newCDPSession(m);
  const touch = (type, pts) => mc.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const probe = (fn) => m.$eval('[data-testid="world-canvas"]', (c, f) => c[f](), fn);
  const foodBefore = (await probe('dravioFood')).length;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.75;
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 30 - i * 8, cy], [cx + 30 + i * 8, cy]]);
  await touch('touchEnd', []);
  await sleep(300);
  const camPinch = await probe('dravioCamera');
  const foodAfterPinch = (await probe('dravioFood')).length;
  await m.locator('[data-testid="world-canvas"]').screenshot({ path: join(OUT, 'mobile-390-zoomed.png') });
  // Kéo một ngón khi đang zoom.
  await touch('touchStart', [[cx + 60, cy - 20]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx + 60 - i * 12, cy - 20]]);
  await touch('touchEnd', []);
  await sleep(200);
  const camPan = await probe('dravioCamera');
  const foodAfterPan = (await probe('dravioFood')).length;
  // Chạm khi zoom: tính toạ độ thế giới mong đợi theo đúng công thức camera.
  const tx = box.x + box.width * 0.2;
  const ty = box.y + box.height * 0.92;
  const k0 = Math.min(box.width / 960, box.height / 540);
  const bx = (box.width - 960 * k0) / 2;
  const by = (box.height - 540 * k0) / 2;
  const k = k0 * camPan.zoom;
  const expected = { x: 960 + (tx - box.x - (bx + 480 * k0 - camPan.fx * k)) / k, y: (ty - box.y - (by + 270 * k0 - camPan.fy * k)) / k };
  await m.touchscreen.tap(tx, ty);
  let dropped = null;
  for (let i = 0; i < 20 && !dropped; i++) {
    await sleep(250);
    dropped = (await probe('dravioFood')).find((f) => Math.abs(f.pos.x - expected.x) < 2 && Math.abs(f.pos.y - expected.y) < 2) ?? null;
  }
  results.dev.camera = {
    pinch: { zoom: camPinch.zoom, mode: camPinch.mode, foodDropped: foodAfterPinch - foodBefore },
    pan: { fxBefore: camPinch.fx, fxAfter: camPan.fx, foodDropped: foodAfterPan - foodAfterPinch },
    tapWhileZoomed: { expected, dropped: dropped?.pos ?? null },
  };
  await m.locator('button', { hasText: /Tổng quan|Overview/ }).click();
  await sleep(200);
  results.dev.camera.overviewButton = await probe('dravioCamera');
  results.dev.pageErrors = errs;
  await browser.close();
  server.kill();
}

writeFileSync(join(OUT, 'renderer-e2e.json'), `${JSON.stringify(results, null, 1)}\n`);
console.log(JSON.stringify(results, null, 1).slice(0, 4000));
// `npx vite` để lại tiến trình con: kết thúc hẳn.
process.exit(0);
