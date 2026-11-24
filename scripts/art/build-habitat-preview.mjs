#!/usr/bin/env node
/**
 * Dravio — preview + kiểm tra render môi trường Khởi Nguyên (G1 Art PR3).
 * Chạy sau generate-origin-habitats: `node scripts/art/build-habitat-preview.mjs`
 *
 * - Đọc manifest qua Vite SSR (vite là devDependency sẵn có).
 * - Ghi `docs/art/origin-habitats-preview.html` (tự chứa, CSS thuần, không JS):
 *   toàn cảnh ghép 3 sinh cảnh, từng sinh cảnh + lớp debug (vùng đi, nước, spot),
 *   ngày/hoàng hôn/đêm, trạng thái chưa khám phá, rồng mẫu theo DRAGON_SCENE_SCALE.
 * - Có Playwright + Chromium sẵn: kiểm tra tải/vẽ Canvas mọi SVG sinh cảnh
 *   → `docs/art/reports/origin-habitats-render.json`, ảnh → `docs/art/previews/`.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vite = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const hab = await vite.ssrLoadModule('/src/assets/habitats/origin/manifest.ts');
await vite.close();

const fileOf = (u) => join(ROOT, u.replace(/^\//, '').replace(/\?.*$/, ''));
const vars = new Map();
const v = (u) => {
  const f = u.startsWith(ROOT) ? u : fileOf(u);
  if (!vars.has(f)) vars.set(f, `--v${vars.size}`);
  return `var(${vars.get(f)})`;
};
const dragon = (sp, mu = 'normal', pose = 'idle') => join(ROOT, `src/assets/animations/frames/${sp}/adult_${mu}_${pose}.svg`);
const K = hab.DRAGON_SCENE_SCALE;
// Actor y-sort trong dải z 50–89 (dưới foreground 90 và lớp ánh sáng 95).
const zOf = (y) => 50 + Math.round(y / 14);

/** Rồng mẫu (chỉ để kiểm tra tỉ lệ/bố cục; vị trí do Behavior Engine quyết định). */
const SAMPLE_DRAGONS = {
  origin_pondbank: [
    ['droplet', 'swim_a', 470, 410, true],
    ['droplet', 'idle', 160, 476, false],
  ],
  origin_meadow: [
    ['emberling', 'idle', 330, 470, false],
    ['sprout', 'eat_a', 545, 400, false],
    ['zephyr', 'idle', 850, 274, false],
  ],
  origin_warm_rocks: [
    ['emberling', 'blink', 370, 412, false],
    ['zephyr', 'idle', 857, 206, false],
  ],
};

function scene(id, { debug = false, time = 'day', locked = false, dragons = true } = {}) {
  const art = hab.ORIGIN_HABITATS[id];
  let h = `<div class="scene" data-time="${time}">`;
  const backdrop = [];
  for (const l of art.layers) {
    const el = `<i class="lay" style="height:${l.height}px;background-image:${v(l.url)};z-index:${l.z}${locked && l.id === 'ground' ? `;filter:saturate(${1 - art.undiscovered.desaturate})` : ''}"></i>`;
    if (l.id === 'foreground') continue;
    backdrop.push(el);
    if (l.id === 'mid' && hab.LIGHTING[time].backdrop) {
      const b = hab.LIGHTING[time].backdrop;
      backdrop.push(`<i class="lay tint" style="height:330px;background:${b.color};opacity:${b.opacity};z-index:30"></i>`);
    }
  }
  h += backdrop.join('');
  if (!locked) {
    const actors = [];
    for (const p of art.props) {
      const a = hab.PROPS[p.prop];
      actors.push({ y: a.flat ? -1 : p.y, html: `<i class="obj" style="left:${p.x - a.anchor[0] * p.scale}px;top:${p.y - a.anchor[1] * p.scale}px;width:${a.width * p.scale}px;height:${a.height * p.scale}px;background-image:${v(a.url)};${p.flip ? 'transform:scaleX(-1);' : ''}z-index:${a.flat ? 45 : zOf(p.y)}"></i>` });
    }
    if (dragons) {
      for (const [sp, pose, x, y, swim] of SAMPLE_DRAGONS[id]) {
        const spot = art.spots.find((s) => s.x === x && s.y === y);
        const sy = spot ? spot.sortY : y;
        const w = 240 * K;
        const hh = 200 * K;
        actors.push({ y, html: `<i class="obj dragon" style="left:${x - 120 * K}px;top:${y - 170 * K}px;width:${w}px;height:${hh}px;background-image:${v(dragon(sp, 'normal', pose))};z-index:${zOf(sy) + (spot?.elevated ? 1 : 0)}"></i>` });
        if (swim) actors.push({ y, html: `<i class="obj" style="left:${x - 70}px;top:${y - 8}px;width:140px;height:30px;background:#6FC3D6;opacity:.6;border-radius:50%;z-index:${zOf(sy) + 1}"></i>` });
      }
    }
    h += actors.map((a) => a.html).join('');
    // Hiệu ứng môi trường: vài hạt CSS theo emitter (minh họa nhịp, không phải hệ hạt thật).
    art.emitters.forEach((em, ei) => {
      if (!em.times.includes(time)) return;
      const [[x0, y0], , [x1, y1]] = em.area;
      const n = Math.min(em.maxActive, 4);
      for (let i = 0; i < n; i++) {
        const fx = hab.ENV_FX[em.frames[0]];
        const x = x0 + ((i + 0.5) / n) * (x1 - x0);
        const y = y0 + (((i * 37) % 100) / 100) * (y1 - y0);
        h += `<i class="fx m-${em.motion}" style="left:${x}px;top:${y}px;width:${fx.width}px;height:${fx.height}px;background-image:${v(fx.url)};animation-delay:${-(i * em.lifeMs) / n}ms;animation-duration:${em.lifeMs}ms;z-index:80" data-emitter="${ei}"></i>`;
      }
    });
  }
  const fg = art.layers.find((l) => l.id === 'foreground');
  h += `<i class="lay" style="height:540px;background-image:${v(fg.url)};z-index:90${locked ? `;filter:saturate(${1 - art.undiscovered.desaturate})` : ''}"></i>`;
  const sc = hab.LIGHTING[time].scene;
  if (sc) h += `<i class="lay tint" style="top:0;height:540px;background:${sc.color};opacity:${sc.opacity};z-index:95"></i>`;
  if (locked) {
    h += `<i class="lay" style="height:540px;background-image:${v(art.undiscovered.mistUrl)};z-index:96"></i>`;
    const [mx, my] = art.undiscovered.markerAt;
    h += `<i class="obj" style="left:${mx - 48}px;top:${my - 124}px;width:96px;height:128px;background-image:${v(art.undiscovered.markerUrl)};z-index:97"></i>`;
  }
  if (debug) {
    const poly = (p) => p.map(([x, y]) => `${x},${y}`).join(' ');
    let s = `<svg class="dbg" viewBox="0 0 960 540"><polygon points="${poly(art.walkArea)}" fill="#FFFFFF" fill-opacity=".12" stroke="#2B2B3A" stroke-dasharray="6 4" stroke-width="2"/>`;
    if (art.water) s += `<polygon points="${poly(art.water)}" fill="#3F8CA6" fill-opacity=".25" stroke="#1F5F75" stroke-width="2"/>`;
    const col = { rest: '#7A5CC2', perch: '#2F7FD0', feed: '#C9674F', drink: '#3F8CA6', bask: '#D98A2B', warm: '#D9532B', swim_entry: '#1F9BB0', play: '#D95C9A' };
    for (const sp of art.spots) {
      s += `<circle cx="${sp.x}" cy="${sp.y}" r="${sp.r}" fill="${col[sp.kind]}" fill-opacity=".18" stroke="${col[sp.kind]}" stroke-width="2.5"${sp.elevated ? ' stroke-dasharray="4 3"' : ''}/><circle cx="${sp.x}" cy="${sp.y}" r="4" fill="${col[sp.kind]}"/><text x="${sp.x + 6}" y="${sp.y - 6}" font-size="14" font-family="system-ui" fill="#2B2B3A" stroke="#FFFFFF" stroke-width="3" paint-order="stroke">${sp.kind}${sp.requires ? ` (${sp.requires})` : ''}</text>`;
    }
    s += '</svg>';
    h += s;
  }
  return `${h}</div>`;
}

const css = [
  ':root{--bg:#F6F1E4;--card:#FFFDF7;--ink:#2B2B3A;--muted:#6B6A73;--line:#E3DCCB}',
  '@media (prefers-color-scheme:dark){:root{--bg:#1E1D24;--card:#2A2932;--ink:#F3EFE6;--muted:#B3AFA6;--line:#3A3944}}',
  'body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:13px/1.45 system-ui,sans-serif}',
  'h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}.note{color:var(--muted);max-width:80ch}',
  '.wrap{overflow-x:auto;max-width:100%}.row{display:flex;gap:0}.grid{display:flex;flex-wrap:wrap;gap:12px}',
  '.scene{position:relative;width:960px;height:540px;overflow:hidden;flex:none;border-radius:6px}',
  '.lay{position:absolute;left:0;top:0;width:960px;background:top left/100% 100% no-repeat}',
  '.tint{mix-blend-mode:multiply}',
  '.obj,.fx{position:absolute;display:block;background:center/100% 100% no-repeat}',
  '.dbg{position:absolute;inset:0;z-index:99}',
  '.pano{zoom:.4}.half{zoom:.5}',
  'figure{margin:0}figcaption{color:var(--muted);font-size:12px;margin-top:4px}',
  '.cat{display:flex;flex-wrap:wrap;gap:8px}.cat figure{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px;text-align:center}',
  '.cat img{display:block;margin:auto;max-height:140px}',
  '@keyframes drift{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}100%{opacity:0;transform:translate(60px,-30px) rotate(90deg)}}',
  '@keyframes flutter{0%,100%{transform:translate(0,0)}25%{transform:translate(40px,-20px) scaleY(.6)}50%{transform:translate(80px,0)}75%{transform:translate(40px,14px) scaleY(.6)}}',
  '@keyframes dart{0%,100%{transform:translate(0,0)}30%{transform:translate(120px,-10px)}60%{transform:translate(60px,20px)}}',
  '@keyframes twinkle{0%,100%{opacity:.1}50%{opacity:1}}',
  '@keyframes shimmer{0%,100%{opacity:0;transform:scaleX(.8)}50%{opacity:.9;transform:scaleX(1.1)}}',
  '@keyframes rise{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:.9}100%{opacity:0;transform:translate(6px,-50px) scale(1.4)}}',
  ...['drift', 'flutter', 'dart', 'twinkle', 'shimmer', 'rise'].map((m) => `.m-${m}{animation:${m} linear infinite}`),
  '@media (prefers-reduced-motion:reduce){.fx{display:none}}',
];

let body = '<h1>Dravio — môi trường Khởi Nguyên (prototype G1)</h1>';
body += `<p class="note">Ba microhabitat cùng một vùng địa lý Tây → Đông: bờ hồ | đồng cỏ | đá ấm; chân trời, núi, đồi, mép đất và lối mòn khớp khi ghép ngang. Mỗi cảnh gồm 5 lớp parallax (sky, far, mid, ground, foreground), vật thể đặt riêng (y-sort cùng rồng), vị trí nghỉ/tương tác, hiệu ứng môi trường, ánh sáng ngày/hoàng hôn/đêm và trạng thái chưa khám phá. Rồng mẫu chỉ để kiểm tra tỉ lệ (DRAGON_SCENE_SCALE = ${K}). Hiệu ứng trong preview là vài hạt CSS minh họa nhịp. Bật "giảm chuyển động" để ẩn hiệu ứng trang trí.</p>`;
body += '<h2>Toàn cảnh (ghép ngang, 40%)</h2><div class="wrap"><div class="row pano">';
for (const id of hab.ORIGIN_HABITAT_IDS) body += scene(id);
body += '</div></div>';
body += '<h2>Từng sinh cảnh + lớp debug (vùng đi nét đứt, nước, spot; viền đứt = spot trên cao)</h2><div class="grid">';
for (const id of hab.ORIGIN_HABITAT_IDS) body += `<figure class="half">${scene(id, { debug: true })}<figcaption style="font-size:24px">${id}</figcaption></figure>`;
body += '</div><h2>Ánh sáng: ngày · hoàng hôn · đêm (đồng cỏ, bờ hồ)</h2><div class="grid">';
for (const id of ['origin_meadow', 'origin_pondbank']) for (const t of ['day', 'dusk', 'night']) body += `<figure class="half">${scene(id, { time: t })}<figcaption style="font-size:24px">${id} · ${t}</figcaption></figure>`;
body += '</div><h2>Chưa khám phá (mờ sương, khử bão hòa, ẩn vật thể/spot/hiệu ứng, biển khám phá)</h2><div class="grid">';
for (const id of hab.ORIGIN_HABITAT_IDS) body += `<figure class="half">${scene(id, { locked: true })}<figcaption style="font-size:24px">${id} · marker ${hab.ORIGIN_HABITATS[id].undiscovered.marker}</figcaption></figure>`;
body += '</div><h2>Danh mục vật thể và hiệu ứng</h2><div class="cat">';
const D = join(ROOT, 'src/assets/habitats/origin');
for (const sub of ['props', 'fx', 'undiscovered']) {
  for (const f of readdirSync(join(D, sub)).sort()) {
    if (f === 'mist.svg') continue;
    body += `<figure><img alt="${f}" src="data:image/svg+xml;base64,${readFileSync(join(D, sub, f)).toString('base64')}"><figcaption>${sub}/${f}</figcaption></figure>`;
  }
}
body += '</div>';
const rootVars = [...vars.entries()].map(([f, name]) => `${name}:url(data:image/svg+xml;base64,${readFileSync(f).toString('base64')})`).join(';');
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dravio Origin Habitats</title><style>:root{${rootVars}}${css.join('')}</style></head><body>${body}</body></html>\n`;
mkdirSync(join(ROOT, 'docs/art'), { recursive: true });
writeFileSync(join(ROOT, 'docs/art/origin-habitats-preview.html'), html);
console.log('Wrote docs/art/origin-habitats-preview.html');

// ---------------------------------------------------------- render check
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('Playwright không có sẵn — bỏ qua kiểm tra render.');
  process.exit(0);
}
const all = [];
const walk = (dir) => {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.svg')) all.push({ file: relative(ROOT, p), uri: `data:image/svg+xml;base64,${readFileSync(p).toString('base64')}` });
  }
};
walk(D);
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
      r.size = [img.naturalWidth, img.naturalHeight];
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let opaque = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++;
      r.coverage = +(opaque / (c.width * c.height)).toFixed(3);
    } catch (e) { r.error = String(e); }
    out.push(r);
  }
  return out;
}, all);
const failures = results.filter((r) => !r.loaded || !(r.coverage > 0.005));
mkdirSync(join(ROOT, 'docs/art/reports'), { recursive: true });
writeFileSync(join(ROOT, 'docs/art/reports/origin-habitats-render.json'), `${JSON.stringify({ tool: 'Chromium (Playwright) Canvas 2D drawImage', browser: browser.version(), files: results.length, failures: failures.length, results }, null, 1)}\n`);
mkdirSync(join(ROOT, 'docs/art/previews'), { recursive: true });
const p = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
await p.goto(`file://${join(ROOT, 'docs/art/origin-habitats-preview.html')}`);
await p.waitForTimeout(400);
const shot = async (sel, name) => {
  const el = (await p.$$(sel))[0];
  if (el) await el.screenshot({ path: join(ROOT, 'docs/art/previews', name) });
};
await shot('.pano', 'origin-panorama.png');
const figs = await p.$$('.grid');
const names = ['origin-debug.png', 'origin-lighting.png', 'origin-undiscovered.png'];
for (let i = 0; i < figs.length; i++) await figs[i].screenshot({ path: join(ROOT, 'docs/art/previews', names[i]) });
await browser.close();
console.log(`Habitat render check: ${results.length} files, ${failures.length} failures`);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 1));
  process.exit(1);
}
