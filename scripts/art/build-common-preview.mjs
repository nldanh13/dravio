#!/usr/bin/env node
/**
 * Dravio — contact sheet + kiểm tra render cho bộ 48 sprite Common.
 *
 * Chạy: `node scripts/art/build-common-preview.mjs`
 *
 * 1. Luôn ghi `docs/art/common-dragons-contact-sheet.html` (tự chứa, SVG nhúng
 *    data URI, không script, không tài nguyên ngoài): 64 / 128 / 256 px + thang xám.
 * 2. Nếu môi trường có sẵn Playwright + Chromium (KHÔNG phải dependency của dự án,
 *    không cài thêm), tải từng SVG bằng <img>, vẽ lên Canvas 2D ở 64/128/256 px,
 *    đo pixel, rồi ghi:
 *      - `docs/art/reports/common-dragons-render.json` (kết quả kiểm tra)
 *      - `src/assets/dragons/common/sprite-metrics.json` (hộp va chạm minh họa)
 *      - `docs/art/previews/*.png` (ảnh xem trước cho người duyệt)
 *    Không có Playwright → bỏ qua bước 2 và báo rõ.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPECIES = ['emberling', 'droplet', 'sprout', 'zephyr'];
const STAGES = ['baby', 'juvenile', 'adult'];
const MUTATIONS = ['normal', 'crystal', 'golden', 'prismatic'];
const LABEL = {
  emberling: 'Emberling', droplet: 'Droplet', sprout: 'Sproutling (sprout)', zephyr: 'Zephyr',
  baby: 'Baby', juvenile: 'Juvenile', adult: 'Adult',
  normal: 'Normal', crystal: 'Crystal ◆', golden: 'Golden ◎', prismatic: 'Prismatic ★',
};

const fileOf = (sp, st, mu) =>
  sp === 'emberling'
    ? join(ROOT, 'src/assets/g0/emberling', `${st}_${mu}.svg`)
    : join(ROOT, 'src/assets/dragons/common', sp, `${st}_${mu}.svg`);

const sprites = [];
for (const sp of SPECIES) for (const st of STAGES) for (const mu of MUTATIONS) {
  const file = fileOf(sp, st, mu);
  const svg = readFileSync(file, 'utf8');
  sprites.push({ sp, st, mu, file: relative(ROOT, file), uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` });
}

// ---------------------------------------------------------------- HTML
function sheetHtml({ sizes, gray }) {
  const css = [
    ':root{--bg:#F6F1E4;--card:#FFFDF7;--ink:#2B2B3A;--muted:#6B6A73;--line:#E3DCCB}',
    '@media (prefers-color-scheme:dark){:root{--bg:#1E1D24;--card:#2A2932;--ink:#F3EFE6;--muted:#B3AFA6;--line:#3A3944}}',
    'body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:13px/1.4 system-ui,sans-serif}',
    'h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}h3{font-size:13px;margin:12px 0 6px;color:var(--muted)}',
    '.grid{display:grid;grid-template-columns:repeat(4,max-content);gap:8px;overflow-x:auto}',
    'figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px;text-align:center}',
    'figcaption{font-size:11px;color:var(--muted)}',
    '.gray .spr{filter:grayscale(1)}.note{color:var(--muted);max-width:70ch}',
    '.spr{margin:auto;background:center/contain no-repeat}',
    // Mỗi SVG chỉ nhúng một lần dưới dạng class nền, dùng lại cho mọi kích thước.
    ...sprites.map((x, i) => `.s${i}{background-image:url(${x.uri})}`),
  ].join('');
  let h = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dravio Common Sprites</title><style>${css}</style></head><body>`;
  h += '<h1>Dravio — 48 sprite Common (prototype G1)</h1>';
  h += '<p class="note">4 loài × 3 giai đoạn × 4 biến thể Aether. Emberling là prototype G0 đã duyệt (giữ nguyên); Droplet, Sproutling, Zephyr là prototype G1 đã được tác giả duyệt (ADR 0101). Huy hiệu ◆/◎/★ là tín hiệu không dựa vào màu. Không phải art thương mại cuối cùng (G3).</p>';
  for (const size of sizes) {
    for (const g of gray ? [false, true] : [false]) {
      h += `<h2>${size}px${g ? ' — thang xám' : ''}</h2>`;
      for (const sp of SPECIES) {
        h += `<h3>${LABEL[sp]}</h3><div class="grid${g ? ' gray' : ''}">`;
        for (const st of STAGES) for (const mu of MUTATIONS) {
          const i = sprites.findIndex((x) => x.sp === sp && x.st === st && x.mu === mu);
          h += `<figure><div class="spr s${i}" role="img" aria-label="${LABEL[sp]} ${LABEL[st]} ${LABEL[mu]}" style="width:${size}px;height:${Math.round((size * 200) / 240)}px"></div><figcaption>${LABEL[st]} · ${LABEL[mu]}</figcaption></figure>`;
        }
        h += '</div>';
      }
    }
  }
  return `${h}</body></html>\n`;
}

mkdirSync(join(ROOT, 'docs/art'), { recursive: true });
writeFileSync(join(ROOT, 'docs/art/common-dragons-contact-sheet.html'), sheetHtml({ sizes: [64, 128, 256], gray: true }));
console.log('Wrote docs/art/common-dragons-contact-sheet.html');

// ---------------------------------------------------------- render check
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('Playwright không có sẵn — bỏ qua kiểm tra render (không phải lỗi).');
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
const results = await page.evaluate(async (list) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load failed')); i.src = src; });
  const out = [];
  for (const s of list) {
    const r = { sp: s.sp, st: s.st, mu: s.mu, file: s.file, loaded: false, sizes: {} };
    try {
      const img = await load(s.uri);
      r.loaded = true;
      r.natural = [img.naturalWidth, img.naturalHeight];
      for (const w of [64, 128, 256]) {
        const h = Math.round((w * 200) / 240);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        let opaque = 0; let minX = w; let minY = h; let maxX = -1; let maxY = -1;
        // Bỏ vùng huy hiệu (góc trên trái 48×48 đơn vị) và bóng (alpha thấp) khỏi bbox.
        const bw = (48 * w) / 240;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const a = d[(y * w + x) * 4 + 3];
          if (a > 0) opaque++;
          if (a > 128 && !(x < bw && y < bw)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
        const k = 240 / w;
        r.sizes[w] = { opaquePx: opaque, coverage: +(opaque / (w * h)).toFixed(3), bbox: maxX < 0 ? null : [Math.round(minX * k), Math.round(minY * k), Math.round((maxX + 1) * k), Math.round((maxY + 1) * k)] };
      }
    } catch (e) { r.error = String(e); }
    out.push(r);
  }
  return out;
}, sprites.map(({ sp, st, mu, file, uri }) => ({ sp, st, mu, file, uri })));

const failures = results.filter((r) => !r.loaded || Object.values(r.sizes).some((z) => !z.bbox || z.coverage < 0.03 || z.bbox[2] > 240 || z.bbox[3] > 200));
mkdirSync(join(ROOT, 'docs/art/reports'), { recursive: true });
writeFileSync(
  join(ROOT, 'docs/art/reports/common-dragons-render.json'),
  `${JSON.stringify({ tool: 'Chromium (Playwright) Canvas 2D drawImage', browser: browser.version(), sprites: results.length, failures: failures.length, results }, null, 1)}\n`,
);

// Hộp va chạm minh họa: bbox đo trên biến thể Normal ở 256 px (đơn vị viewBox 240×200).
const metrics = { viewBox: [240, 200], anchor: { x: 120, y: 170 }, note: 'hitbox = bbox alpha>50% của biến thể Normal đo ở 256px, đơn vị viewBox; chỉ để minh họa, không dùng cho logic domain', hitbox: {} };
for (const r of results.filter((x) => x.mu === 'normal')) {
  metrics.hitbox[r.sp] ??= {};
  const [x0, y0, x1, y1] = r.sizes[256].bbox;
  metrics.hitbox[r.sp][r.st] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
writeFileSync(join(ROOT, 'src/assets/dragons/common/sprite-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);

// Ảnh xem trước PNG.
mkdirSync(join(ROOT, 'docs/art/previews'), { recursive: true });
for (const [name, opts] of [
  ['common-dragons-128.png', { sizes: [128], gray: false }],
  ['common-dragons-64-gray.png', { sizes: [64], gray: true }],
]) {
  const p = await browser.newPage({ viewport: { width: 1100, height: 600 }, deviceScaleFactor: 1 });
  await p.setContent(sheetHtml(opts));
  await p.waitForTimeout(200);
  await p.screenshot({ path: join(ROOT, 'docs/art/previews', name), fullPage: true });
  await p.close();
}
await browser.close();
console.log(`Render check: ${results.length} sprites, ${failures.length} failures`);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 1));
  process.exit(1);
}
