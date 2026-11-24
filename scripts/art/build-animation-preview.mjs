#!/usr/bin/env node
/**
 * Dravio — preview + đo đạc hoạt ảnh rồng (PR2).
 * Chạy (sau generate-common-dragons + generate-effects): `node scripts/art/build-animation-preview.mjs`
 *
 * - Đọc đặc tả clip từ `src/assets/animations/dragonAnimations.ts` qua Vite SSR (vite đã là
 *   devDependency; không cài thêm gì).
 * - Ghi `docs/art/dragon-animations-preview.html`: trang tự chứa, hoạt ảnh bằng CSS thuần
 *   (không JavaScript), tôn trọng prefers-reduced-motion.
 * - Nếu có Playwright + Chromium sẵn trong môi trường: đo hitbox từng khung (biến thể Normal)
 *   → `src/assets/animations/frame-metrics.json`, kiểm tra tải/vẽ Canvas mọi khung
 *   → `docs/art/reports/dragon-frames-render.json`, ảnh filmstrip → `docs/art/previews/`.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRAMES = join(ROOT, 'src/assets/animations/frames');
const FX_DIR = join(ROOT, 'src/assets/effects/dragon');
const SPECIES = ['emberling', 'droplet', 'sprout', 'zephyr'];
const NAMES = { emberling: 'Emberling', droplet: 'Droplet', sprout: 'Sproutling', zephyr: 'Zephyr' };
const STAGE_SCALE = { baby: 0.68, juvenile: 0.85, adult: 1 };

const vite = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const anim = await vite.ssrLoadModule('/src/assets/animations/dragonAnimations.ts');
await vite.close();
const frameData = JSON.parse(readFileSync(join(ROOT, 'src/assets/animations/frame-data.json'), 'utf8'));

const b64 = (file) => `data:image/svg+xml;base64,${readFileSync(file).toString('base64')}`;
const FX_SIZE = {
  shadow: [128, 24, 64, 12], zzz: [64, 64, 8, 56], heart: [48, 48, 24, 44], happy_burst: [64, 64, 32, 56], crumbs: [48, 32, 20, 6],
  dust: [64, 32, 32, 30], ripple: [128, 32, 64, 16], water_surface: [256, 64, 128, 8], bubbles: [32, 48, 12, 44], wind: [64, 48, 60, 26],
  bandage: [48, 32, 24, 16], care_leaf: [48, 48, 24, 46], recovery_glow: [96, 96, 48, 48],
};
const FX_TRAVEL = { zzz: [8, -18], heart: [0, -20], happy_burst: [0, -10], crumbs: [4, 10], dust: [-6, -4], bubbles: [2, -16], wind: [-24, 0], care_leaf: [0, -4] };
const INFORMATIONAL = new Set(['bandage', 'care_leaf', 'water_surface']);

// ---------------------------------------------------------------- HTML
const CELL = 200; // px CSS cho khung 240 đơn vị
const k = CELL / 240;
const PAD = 56; // khoảng trống phía trên để thấy rồng bay/nhảy
const pct = (t) => `${(t * 100).toFixed(2)}%`;

function buildHtml(stages) {
  const css = [];
  const body = [];
  const used = new Map();
  // Mỗi SVG nhúng đúng một lần dưới dạng biến CSS; class và keyframes đều tham chiếu biến.
  const rootVars = [];
  const cls = (file) => {
    if (!used.has(file)) {
      const c = `f${used.size}`;
      used.set(file, c);
      rootVars.push(`--${c}:url(${b64(file)})`);
      css.push(`.${c}{background-image:var(--${c})}`);
    }
    return used.get(file);
  };
  let n = 0;
  for (const stage of stages) {
    body.push(`<h2>${stage[0].toUpperCase()}${stage.slice(1)} · Normal</h2>`);
    for (const sp of SPECIES) {
      body.push(`<h3>${NAMES[sp]}</h3><div class="row">`);
      for (const state of anim.DRAGON_ANIM_STATES) {
        const clip = anim.resolveDragonClip(sp, state);
        if (!clip) {
          body.push(`<figure class="na"><div class="cell"><span>—</span></div><figcaption>${state} · không áp dụng</figcaption></figure>`);
          continue;
        }
        const id = `a${n++}`;
        const dur = clip.durationMs;
        // Flipbook: chèn nhấp nháy tất định cho preview (runtime chọn ngẫu nhiên bằng RNG cosmetic).
        let frames = clip.frames.map((f) => ({ t: f.t, pose: anim.resolvePose(sp, f.pose) }));
        if (clip.blink && clip.frames.length === 1) {
          const bt = 0.8;
          const be = bt + clip.blink.durMs / dur;
          frames = [...frames, { t: bt, pose: anim.resolvePose(sp, clip.blink.pose) }, { t: be, pose: frames[0].pose }];
        }
        const fileOf = (pose) => join(FRAMES, sp, `${stage}_normal_${pose}.svg`);
        const fb = frames.map((f) => `${pct(f.t)}{background-image:var(--${cls(fileOf(f.pose))})}`).join('');
        // Dùng class cho khung đầu để ảnh tĩnh khi reduced motion.
        const first = cls(fileOf(frames[0].pose));
        const s = STAGE_SCALE[stage];
        const tr = clip.track
          .map((t) => `${pct(t.t)}{transform:translate(${(t.dx * s * k).toFixed(2)}px,${(t.dy * s * k).toFixed(2)}px) rotate(${t.rot}deg) scale(${t.sx},${t.sy})}`)
          .join('');
        css.push(`@keyframes ${id}fb{${fb}}@keyframes ${id}tr{${tr}}`);
        css.push(`#${id} .spr{animation:${id}fb ${dur}ms step-end infinite,${id}tr ${dur}ms linear infinite}`);
        if (clip.descend) {
          // Hạ cánh liên tục: lấy mẫu altitudeAt (cùng hàm renderer dùng).
          const steps = Array.from({ length: 11 }, (_, i) => i / 10);
          const kf = steps.map((t) => `${pct(t)}{transform:translateY(${(-anim.altitudeAt(sp, clip, stage, t) * k).toFixed(2)}px)}`).join('');
          css.push(`@keyframes ${id}al{${kf}}#${id} .lift{animation:${id}al ${dur}ms linear infinite}`);
        }
        const alt = clip.altitude ? clip.altitude[stage] * k : 0;
        const attach = frameData.attach[sp][stage][frames[0].pose] ?? {};
        const shadowW = 128 * s * k * (clip.shadow === 'altitude' ? 0.7 : 1);
        let fx = '';
        if (clip.shadow !== 'water') fx += `<i class="shadow" style="width:${shadowW}px;height:${24 * s * k}px;left:${120 * k - shadowW / 2}px;top:${170 * k - 12 * s * k + 4}px"></i>`;
        let fxFront = '';
        clip.fx.forEach((cue, i) => {
          const [w, h, ax, ay] = FX_SIZE[cue.fx];
          const pt = cue.at === 'ground' ? [120, 170] : attach[cue.at] ?? attach.body ?? [120, 120];
          const x = (pt[0] + (cue.dx ?? 0) * s) * k - ax * k * 0.8;
          const y = (pt[1] + (cue.dy ?? 0) * s) * k - ay * k * 0.8 - (cue.at === 'ground' ? 0 : alt);
          const fxId = `${id}x${i}`;
          const t0 = cue.t;
          const t1 = Math.min(1, cue.t + cue.durMs / dur);
          const info = INFORMATIONAL.has(cue.fx);
          const [tx, ty] = FX_TRAVEL[cue.fx] ?? [0, 0];
          const frames2 = info
            ? `0%{opacity:1}100%{opacity:1}`
            : `0%{opacity:0;transform:translate(0,0) scale(.8)}${pct(t0)}{opacity:0;transform:translate(0,0) scale(.8)}${pct(Math.min(1, t0 + 0.05))}{opacity:1;transform:translate(0,0) scale(1)}${pct(t1)}{opacity:0;transform:translate(${tx * k}px,${ty * k}px) scale(1.05)}100%{opacity:0}`;
          css.push(`@keyframes ${fxId}{${frames2}}#${fxId}{animation:${fxId} ${dur}ms linear infinite}`);
          const el = `<i id="${fxId}" class="fx ${cls(join(FX_DIR, `${cue.fx}.svg`))}${info ? ' info' : ''}" style="width:${w * k * 0.8}px;height:${h * k * 0.8}px;left:${x}px;top:${y}px"></i>`;
          if (cue.fx === 'ripple') fx += el;
          else fxFront += el;
        });
        let water = '';
        if (clip.shadow === 'water') {
          const wl = attach.waterline ?? [120, 130];
          // water_surface 256×64, mép nước ở y=8 → đặt sao cho mép nước trùng waterline của khung.
          const wh = CELL / 4;
          water = `<i class="fx info ${cls(join(FX_DIR, 'water_surface.svg'))}" style="width:${CELL}px;height:${wh}px;left:0;top:${wl[1] * k - (8 / 64) * wh}px"></i><i class="deep" style="top:${wl[1] * k - (8 / 64) * wh + wh}px"></i>`;
        }
        const meta = `${dur} ms · ${clip.loop ? 'lặp' : `một lần → ${clip.returnsTo}`}`;
        body.push(
          `<figure id="${id}"><div class="cell"><div class="box">${fx}<div class="lift" style="transform:translateY(${-alt}px)"><div class="spr ${first}"></div></div>${water}${fxFront}</div></div><figcaption><b>${state}</b> · ${meta}</figcaption></figure>`,
        );
      }
      body.push('</div>');
    }
  }
  const base = [
    ':root{--bg:#F6F1E4;--card:#FFFDF7;--ink:#2B2B3A;--muted:#6B6A73;--line:#E3DCCB}',
    '@media (prefers-color-scheme:dark){:root{--bg:#1E1D24;--card:#2A2932;--ink:#F3EFE6;--muted:#B3AFA6;--line:#3A3944}}',
    'body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:13px/1.4 system-ui,sans-serif}',
    'h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 4px}h3{font-size:13px;margin:12px 0 6px;color:var(--muted)}',
    '.note{color:var(--muted);max-width:75ch}.row{display:flex;flex-wrap:wrap;gap:8px}',
    'figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px;width:' + CELL + 'px}',
    'figcaption{font-size:11px;color:var(--muted)}.na{opacity:.55}.na .cell{display:grid;place-items:center;font-size:28px;color:var(--muted)}',
    `.cell{position:relative;width:${CELL}px;height:${(CELL * 200) / 240 + PAD}px;overflow:hidden;background:linear-gradient(#EAF4E4 0 ${170 * k + PAD}px,#DCE9C8 ${170 * k + PAD}px);border-radius:6px}`,
    `.box{position:absolute;left:0;right:0;top:${PAD}px;height:${(CELL * 200) / 240}px}`,
    '.lift{position:absolute;inset:0}',
    '.deep{position:absolute;left:0;right:0;bottom:-60px;background:#6FC3D6;opacity:.55}',
    `.spr{position:absolute;inset:0;background:center/100% 100% no-repeat;transform-origin:${120 * k}px ${170 * k}px}`,
    '.fx,.shadow{position:absolute;display:block;background:center/contain no-repeat}.shadow{background:#293F45;opacity:.13;border-radius:50%}',
    '@media (prefers-reduced-motion:reduce){.spr,.fx{animation:none!important}.fx:not(.info){display:none}}',
  ];
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dravio Dragon Animations</title><style>:root{${rootVars.join(';')}}${[...base, ...css].join('')}</style></head><body><h1>Dravio — hoạt ảnh rồng Common (prototype G1)</h1><p class="note">Mỗi ô chạy đúng clip trong <code>src/assets/animations/dragonAnimations.ts</code> (flipbook tư thế + track transform quanh điểm neo chân + hiệu ứng). Ô “không áp dụng” = loài không có khả năng vận động đó trong catalog sinh học. Clip một lần được lặp lại để xem. Nhấp nháy trong preview đặt cố định; runtime chọn bằng RNG cosmetic 3–5 s. Bật “giảm chuyển động” của hệ điều hành để xem trạng thái tĩnh (chỉ giữ hiệu ứng mang thông tin).</p>${body.join('')}</body></html>\n`;
}

mkdirSync(join(ROOT, 'docs/art'), { recursive: true });
writeFileSync(join(ROOT, 'docs/art/dragon-animations-preview.html'), buildHtml(['adult', 'baby']));
console.log('Wrote docs/art/dragon-animations-preview.html');

// ---------------------------------------------------------- measure
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('Playwright không có sẵn — bỏ qua đo hitbox/kiểm tra render (frame-metrics.json giữ bản cũ).');
  process.exit(0);
}
const all = [];
for (const sp of SPECIES) for (const f of readdirSync(join(FRAMES, sp)).sort()) all.push({ sp, file: `src/assets/animations/frames/${sp}/${f}`, name: f, uri: b64(join(FRAMES, sp, f)) });
for (const f of readdirSync(FX_DIR).sort()) all.push({ sp: 'fx', file: `src/assets/effects/dragon/${f}`, name: f, uri: b64(join(FX_DIR, f)) });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
const results = await page.evaluate(async (list) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load failed')); i.src = src; });
  const out = [];
  for (const s of list) {
    const r = { file: s.file, loaded: false };
    try {
      const img = await load(s.uri);
      r.loaded = true;
      const w = s.sp === 'fx' ? img.naturalWidth * 2 : 256;
      const h = s.sp === 'fx' ? img.naturalHeight * 2 : Math.round((256 * 200) / 240);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let minX = w; let minY = h; let maxX = -1; let maxY = -1; let opaque = 0;
      const bw = (48 * w) / 240;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const a = d[(y * w + x) * 4 + 3];
        if (a > 0) opaque++;
        if (a > (s.sp === 'fx' ? 0 : 128) && !(s.sp !== 'fx' && x < bw && y < bw)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      const kk = s.sp === 'fx' ? 0.5 : 240 / 256;
      r.opaquePx = opaque;
      r.bbox = maxX < 0 ? null : [Math.round(minX * kk), Math.round(minY * kk), Math.round((maxX + 1) * kk), Math.round((maxY + 1) * kk)];
    } catch (e) { r.error = String(e); }
    out.push(r);
  }
  return out;
}, all.map(({ sp, file, uri }) => ({ sp, file, uri })));

const failures = results.filter((r) => !r.loaded || !r.bbox || r.opaquePx < 20);
mkdirSync(join(ROOT, 'docs/art/reports'), { recursive: true });
writeFileSync(
  join(ROOT, 'docs/art/reports/dragon-frames-render.json'),
  `${JSON.stringify({ tool: 'Chromium (Playwright) Canvas 2D drawImage', browser: browser.version(), files: results.length, failures: failures.length, results }, null, 1)}\n`,
);
const hitbox = {};
for (const r of results) {
  const m = /frames\/(\w+)\/(baby|juvenile|adult)_normal_(\w+)\.svg$/.exec(r.file);
  if (!m || !r.bbox) continue;
  const [, sp, st, pose] = m;
  hitbox[sp] ??= {};
  hitbox[sp][st] ??= {};
  hitbox[sp][st][pose] = { x: r.bbox[0], y: r.bbox[1], w: r.bbox[2] - r.bbox[0], h: r.bbox[3] - r.bbox[1] };
}
writeFileSync(
  join(ROOT, 'src/assets/animations/frame-metrics.json'),
  `${JSON.stringify({ note: 'Sinh bởi scripts/art/build-animation-preview.mjs — bbox alpha>50% biến thể Normal đo ở 256px, đơn vị viewBox 240×200; chỉ minh họa, không dùng cho logic domain.', hitbox }, null, 1)}\n`,
);

// Filmstrip PNG: mọi tư thế, Adult Normal và Baby Golden (Aether giữ nguyên qua tư thế).
mkdirSync(join(ROOT, 'docs/art/previews'), { recursive: true });
for (const [stage, mut] of [['adult', 'normal'], ['baby', 'golden']]) {
  let html = '<body style="margin:0;padding:12px;background:#F6F1E4;font:12px system-ui,sans-serif;color:#2B2B3A">';
  html += `<h2 style="margin:0 0 8px;font-size:16px">Tư thế khung hoạt ảnh — ${stage} · ${mut}</h2>`;
  for (const sp of SPECIES) {
    html += `<div style="display:flex;gap:6px;margin-bottom:8px;align-items:flex-end"><b style="width:90px">${NAMES[sp]}</b>`;
    for (const pose of frameData.poses[sp]) {
      html += `<div style="text-align:center"><img src="${b64(join(FRAMES, sp, `${stage}_${mut}_${pose}.svg`))}" width="120" height="100" style="background:#FFFDF7;border:1px solid #E3DCCB;border-radius:6px;display:block">${pose}</div>`;
    }
    html += '</div>';
  }
  const p = await browser.newPage({ viewport: { width: 1700, height: 400 }, deviceScaleFactor: 1 });
  await p.setContent(html);
  await p.waitForTimeout(200);
  await p.screenshot({ path: join(ROOT, `docs/art/previews/dragon-poses-${stage}-${mut}.png`), fullPage: true });
  await p.close();
}
// Ảnh chụp trang preview hoạt ảnh tại một thời điểm.
{
  const p = await browser.newPage({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 1 });
  await p.goto(`file://${join(ROOT, 'docs/art/dragon-animations-preview.html')}`);
  await p.waitForTimeout(450);
  await p.screenshot({ path: join(ROOT, 'docs/art/previews/dragon-animations-preview.png'), fullPage: false, clip: { x: 0, y: 0, width: 1180, height: 1400 > 800 ? 800 : 1400 } });
  await p.close();
}
await browser.close();
console.log(`Frame render check: ${results.length} files, ${failures.length} failures`);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 1));
  process.exit(1);
}
