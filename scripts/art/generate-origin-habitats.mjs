#!/usr/bin/env node
/**
 * Dravio — tài nguyên môi trường Khởi Nguyên (G1 Art PR3).
 * Chạy: `node scripts/art/generate-origin-habitats.mjs`
 *
 * Đầu ra `src/assets/habitats/origin/`:
 *   <habitatId>/{sky,far,mid,ground,foreground}.svg   — 5 lớp parallax, 960×540
 *   props/<propId>.svg                                — vật thể đặt riêng (y-sort cùng rồng)
 *   fx/<fxId>.svg                                     — hiệu ứng môi trường
 *   undiscovered/*.svg                                — trạng thái chưa khám phá
 *
 * Địa lý: một vùng liền mạch theo trục Tây → Đông: bờ hồ (0–960) | đồng cỏ (960–1920) |
 * đá ấm (1920–2880). Mọi đường chân trời, dãy núi, đồi, mép đất và lối mòn được tính theo
 * toạ độ toàn cục nên ba cảnh ghép ngang khớp mép. Hình học tất định (PRNG có seed, không
 * Math.random). Không script, không tham chiếu ngoài, không chữ.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'assets', 'habitats', 'origin');
const W = 960;
const H = 540;
const HABITATS = { origin_pondbank: 0, origin_meadow: 960, origin_warm_rocks: 1920 };
const SPAN = 2880;

// ---------------------------------------------------------------- helpers
const r1 = (n) => {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? '0' : String(v);
};
const pt = (x, y) => `${r1(x)} ${r1(y)}`;
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${typeof v === 'number' ? r1(v) : v}"`)
    .join(' ');
const path = (d, a = {}) => `<path ${attrs({ d, ...a })}/>`;
const ellipse = (cx, cy, rx, ry, a = {}) => `<ellipse ${attrs({ cx, cy, rx, ry, ...a })}/>`;
const circle = (cx, cy, r, a = {}) => `<circle ${attrs({ cx, cy, r, ...a })}/>`;
const rect = (x, y, w, h, a = {}) => `<rect ${attrs({ x, y, width: w, height: h, ...a })}/>`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
function lerpStops(stops, x) {
  const s = [...stops].sort((a, b) => a[0] - b[0]);
  if (x <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (x <= s[i][0]) {
      const [x0, c0] = s[i - 1];
      const [x1, c1] = s[i];
      const u = (x - x0) / (x1 - x0);
      const a = hex(c0);
      const b = hex(c1);
      return toHex(a.map((v, k) => v + (b[k] - v) * u));
    }
  }
  return s[s.length - 1][1];
}
/** Polygon theo hàm mép trên f(gx), lấp xuống tới y=bottom. */
function bandD(off, f, bottom, step = 12) {
  let d = `M0 ${bottom} L0 ${r1(f(off))}`;
  for (let x = step; x < W; x += step) d += ` L${pt(x, f(off + x))}`;
  d += ` L${pt(W, f(off + W))} L${W} ${bottom}Z`;
  return d;
}
const svg = (w, h, attrsStr, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${attrsStr} data-asset-status="prototype">${body}</svg>\n`;

// ---------------------------------------------------------------- palette
// Cozy pastel, cùng họ màu với rồng (viền đậm hơn nền, bo tròn).
const P = {
  skyTop: '#BFE2F1',
  skyHorizon: '#F4F0DA',
  cloud: '#FFFFFF',
  cloudShade: '#E3EEF3',
  ridgeFar: '#BACFD3',
  ridgeNear: '#A6C2C4',
  hill: [[0, '#93C49A'], [1440, '#A6CC8E'], [2160, '#C6C48F'], [2880, '#D6BC90']],
  groundBack: [[0, '#B9D89C'], [1440, '#C3DC9C'], [2100, '#DCD5A4'], [2880, '#E8D4A8']],
  groundFront: [[0, '#94C27E'], [1440, '#A2CA82'], [2100, '#C9C08A'], [2880, '#D8BD8E']],
  path: '#E9D9B0',
  pathEdge: '#CDB78A',
  grassDark: '#6FA563',
  grassLine: '#5E8F57',
  flowerPink: '#F6B4C8',
  flowerYellow: '#FFE59A',
  flowerWhite: '#FFFFFF',
  water: '#8FD1DF',
  waterDeep: '#5FA9C2',
  waterLine: '#3F8CA6',
  mud: '#CDB58A',
  mudLine: '#A58B62',
  stone: '#E2C6A3',
  stoneShade: '#C9A684',
  stoneLine: '#9E7A5E',
  sand: '#EBD7AC',
  trunk: '#A97C58',
  trunkLine: '#6F4E37',
  leaf: '#8CC48A',
  leafDark: '#6EA86E',
  reed: '#A3BE6E',
  reedLine: '#6F8D45',
  berry: '#C9674F',
  ink: '#3A303A',
};

// ---------------------------------------------------------------- global terrain
const ridge = (gx) => 196 + 20 * Math.sin(gx / 170) + 9 * Math.sin(gx / 57 + 1.3) + 5 * Math.sin(gx / 23 + 0.4);
const ridge2 = (gx) => 226 + 14 * Math.sin(gx / 130 + 2) + 7 * Math.sin(gx / 41 + 0.7);
const hill = (gx) => 266 + 12 * Math.sin(gx / 120 + 0.5) + 6 * Math.sin(gx / 47 + 2);
const groundTop = (gx) => 304 + 5 * Math.sin(gx / 90 + 1);
const pathY = (gx) => 500 + 10 * Math.sin(gx / 140 + 0.3);

// ---------------------------------------------------------------- layers
function skyLayer(id, off) {
  const g = `${id}-sky`;
  let b = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${P.skyTop}"/><stop offset="1" stop-color="${P.skyHorizon}"/></linearGradient></defs>`;
  b += rect(0, 0, W, 330, { fill: `url(#${g})` });
  // Mây theo toạ độ toàn cục → nối liền giữa các cảnh.
  const clouds = [[180, 96, 1], [760, 62, 0.8], [1180, 120, 1.1], [1700, 80, 0.9], [2250, 110, 1], [2700, 70, 0.85]];
  for (const [gx, y, s] of clouds) {
    const x = gx - off;
    if (x < -160 || x > W + 160) continue;
    b += `<g data-part="cloud" opacity=".95">${ellipse(x, y + 8 * s, 74 * s, 16 * s, { fill: P.cloudShade })}${circle(x - 36 * s, y, 22 * s, { fill: P.cloud })}${circle(x, y - 10 * s, 30 * s, { fill: P.cloud })}${circle(x + 38 * s, y, 20 * s, { fill: P.cloud })}${ellipse(x, y + 6 * s, 70 * s, 14 * s, { fill: P.cloud })}</g>`;
  }
  // Đảo trời thấp (cửa ngõ Thiên Giới, world graph) — xa, mờ, chỉ thấy phía trên đồng cỏ.
  const ix = 1540 - off;
  if (ix > -120 && ix < W + 120) {
    b += `<g data-part="sky-island" opacity=".6">${path(`M${pt(ix - 64, 148)} Q${pt(ix - 50, 166)} ${pt(ix - 22, 170)} Q${pt(ix - 6, 182)} ${pt(ix + 8, 172)} Q${pt(ix + 40, 168)} ${pt(ix + 64, 148)}Z`, { fill: '#B9C4C6' })}${ellipse(ix, 147, 66, 7, { fill: '#A9C7A4' })}${circle(ix - 24, 136, 12, { fill: '#9DBF98' })}${circle(ix - 8, 132, 14, { fill: '#9DBF98' })}${circle(ix + 30, 138, 9, { fill: '#9DBF98' })}</g>`;
  }
  return svg(W, 330, `data-habitat="${id}" data-layer="sky"`, b);
}

function farLayer(id, off) {
  const b = path(bandD(off, ridge, 330), { fill: P.ridgeFar }) + path(bandD(off, ridge2, 330), { fill: P.ridgeNear });
  return svg(W, 330, `data-habitat="${id}" data-layer="far"`, b);
}

function treeBlob(x, y, s, fill) {
  return `${rect(x - 2 * s, y - 2, 4 * s, 14 * s, { fill: '#8D7A63' })}${circle(x, y - 10 * s, 14 * s, { fill })}${circle(x - 10 * s, y - 2 * s, 10 * s, { fill })}${circle(x + 10 * s, y - 2 * s, 10 * s, { fill })}`;
}
function mesa(x, y, w, h, fill) {
  return path(`M${pt(x - w / 2, y)} L${pt(x - w / 2 + 10, y - h)} L${pt(x + w / 2 - 12, y - h - 3)} L${pt(x + w / 2, y)}Z`, { fill });
}

function midLayer(id, off) {
  let b = '';
  // Dải đồi giữa, màu chuyển theo vị trí toàn cục.
  const seg = 96;
  for (let x = 0; x < W; x += seg) {
    const c = lerpStops(P.hill, off + x + seg / 2);
    b += path(
      `M${pt(x - 1, 330)} L${pt(x - 1, hill(off + x - 1))}` +
        Array.from({ length: 9 }, (_, i) => ` L${pt(x + (i * seg) / 8, hill(off + x + (i * seg) / 8))}`).join('') +
        ` L${pt(x + seg + 1, hill(off + x + seg + 1))} L${pt(x + seg + 1, 330)}Z`,
      { fill: c },
    );
  }
  // Trang trí xa theo toạ độ toàn cục.
  const rng = mulberry32(7);
  for (let gx = 20; gx < SPAN; gx += 46 + rng() * 40) {
    const x = gx - off;
    const s = 0.8 + rng() * 0.6;
    if (x < -40 || x > W + 40) continue;
    const y = hill(gx) + 4;
    if (gx < 1800) b += treeBlob(x, y, s, gx < 960 ? '#7FAF8E' : '#86B57F');
    else if (gx > 2050) b += mesa(x, y + 2, 50 * s, 26 * s, '#D3AE88');
    else b += treeBlob(x, y, s * 0.8, '#A7B97C');
  }
  // Cửa sông về phía Thủy Vực (world graph) — dải nước xa ở mép tây bờ hồ.
  if (off === 0) b += `<g data-part="estuary-hint">${path(`M0 ${r1(hill(0) + 14)} Q120 ${r1(hill(120) + 6)} 260 ${r1(hill(260) + 18)} L0 ${r1(hill(0) + 26)}Z`, { fill: '#BFE3EC' })}</g>`;
  return svg(W, 330, `data-habitat="${id}" data-layer="mid"`, b);
}

function grassBlade(x, y, h, lean, color) {
  return path(`M${pt(x - 2, y)} Q${pt(x + lean * 0.4, y - h * 0.6)} ${pt(x + lean, y - h)} Q${pt(x + lean * 0.2 + 1, y - h * 0.5)} ${pt(x + 2, y)}Z`, { fill: color });
}
function flower(x, y, color, s = 1) {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    d += circle(x + Math.cos(a) * 2.6 * s, y + Math.sin(a) * 2.6 * s, 2.2 * s, { fill: color });
  }
  return d + circle(x, y, 1.6 * s, { fill: '#E7B864' });
}

const POND = { cx: 470, cy: 398, rx: 250, ry: 66 };
function pondD(pad = 0) {
  const { cx, cy, rx, ry } = POND;
  const n = 28;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.06 * Math.sin(a * 3 + 0.7) + 0.04 * Math.sin(a * 5);
    const x = cx + Math.cos(a) * (rx + pad) * wob;
    const y = cy + Math.sin(a) * (ry + pad * 0.5) * wob;
    d += `${i === 0 ? 'M' : 'L'}${pt(x, y)} `;
  }
  return `${d.trim()}Z`;
}
const SLABS = [
  [[240, 372], [380, 352], [470, 380], [430, 430], [280, 436], [210, 408]],
  [[520, 410], [660, 392], [760, 420], [720, 468], [560, 470]],
  [[120, 460], [230, 452], [260, 494], [150, 504], [96, 486]],
];

function groundLayer(id, off) {
  const g = `${id}-ground`;
  // Màu đất theo toạ độ toàn cục (gradient ngang) → mép trái/phải khớp cảnh bên cạnh;
  // phủ thêm lớp sương nhạt phía xa (gradient dọc) để tạo chiều sâu.
  const stops = [0, 0.25, 0.5, 0.75, 1].map((u) => `<stop offset="${u}" stop-color="${lerpStops(P.groundFront, off + u * W)}"/>`).join('');
  let b = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient><linearGradient id="${g}-haze" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFFFFF" stop-opacity=".38"/><stop offset=".45" stop-color="#FFFFFF" stop-opacity=".12"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient></defs>`;
  b += path(bandD(off, groundTop, H), { fill: `url(#${g})` });
  b += path(bandD(off, groundTop, H), { fill: `url(#${g}-haze)` });
  const rng = mulberry32(off + 11);
  if (id === 'origin_warm_rocks') {
    // Cát nóng + phiến đá phẳng lớn.
    for (let i = 0; i < 6; i++) b += ellipse(80 + i * 160 + rng() * 40, 340 + rng() * 140, 70 + rng() * 40, 10 + rng() * 6, { fill: P.sand, opacity: 0.7 });
    for (const poly of SLABS) {
      // Bo góc: đi qua trung điểm các cạnh, đỉnh làm điểm điều khiển.
      const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const m0 = mid(poly[poly.length - 1], poly[0]);
      let d = `M${pt(m0[0], m0[1])}`;
      poly.forEach((v, i) => {
        const m = mid(v, poly[(i + 1) % poly.length]);
        d += ` Q${pt(v[0], v[1])} ${pt(m[0], m[1])}`;
      });
      d += 'Z';
      b += path(d, { fill: P.stone, stroke: P.stoneLine, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'data-part': 'stone-slab' });
      const [a, c] = [poly[0], poly[2]];
      b += path(`M${pt((a[0] + c[0]) / 2 - 20, (a[1] + c[1]) / 2)} l14 6 l10 -4`, { fill: 'none', stroke: P.stoneShade, 'stroke-width': 2, 'stroke-linecap': 'round' });
    }
  } else {
    // Thảm cỏ (lá cỏ rải tất định) + hoa.
    const n = id === 'origin_meadow' ? 260 : 170;
    for (let i = 0; i < n; i++) {
      const x = rng() * W;
      const y = groundTop(off + x) + 12 + rng() * (H - 330);
      if (id === 'origin_pondbank' && (x - POND.cx) ** 2 / (POND.rx + 30) ** 2 + (y - POND.cy) ** 2 / (POND.ry + 20) ** 2 < 1) continue;
      const h = 6 + rng() * 8 + (y - 300) * 0.03;
      b += grassBlade(x, y, h, (rng() - 0.5) * 6, rng() < 0.5 ? P.grassDark : lerpStops(P.groundFront, off + x));
    }
    const nf = id === 'origin_meadow' ? 70 : 24;
    const colors = [P.flowerPink, P.flowerYellow, P.flowerWhite];
    for (let i = 0; i < nf; i++) {
      const x = rng() * W;
      const y = groundTop(off + x) + 20 + rng() * (H - 340);
      if (id === 'origin_pondbank' && (x - POND.cx) ** 2 / (POND.rx + 30) ** 2 + (y - POND.cy) ** 2 / (POND.ry + 20) ** 2 < 1) continue;
      b += flower(x, y, colors[i % 3], 0.8 + (y - 300) / 400);
    }
  }
  if (id === 'origin_pondbank') {
    const wg = `${id}-water`;
    b += `<defs><radialGradient id="${wg}" cx=".5" cy=".4" r=".7"><stop stop-color="${P.water}"/><stop offset="1" stop-color="${P.waterDeep}"/></radialGradient></defs>`;
    b += path(pondD(18), { fill: P.mud, stroke: P.mudLine, 'stroke-width': 2.4, 'data-part': 'mud-bank' });
    b += path(pondD(0), { fill: `url(#${wg})`, stroke: P.waterLine, 'stroke-width': 2.6, 'data-part': 'water' });
    // Lạch nước chảy về cửa sông (mép tây).
    b += path(`M0 352 Q110 340 ${r1(POND.cx - POND.rx + 20)} ${r1(POND.cy - 18)} L${r1(POND.cx - POND.rx + 26)} ${r1(POND.cy + 6)} Q110 368 0 372Z`, { fill: P.water, stroke: P.waterLine, 'stroke-width': 2.2, 'data-part': 'stream' });
    for (const [x, y, w] of [[380, 380, 60], [540, 410, 80], [470, 430, 40], [610, 386, 36]]) {
      b += path(`M${pt(x - w / 2, y)} Q${pt(x, y - 4)} ${pt(x + w / 2, y)}`, { fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.75 });
    }
  }
  // Lối mòn nối ba sinh cảnh (cùng y ở mép, khớp cảnh bên cạnh).
  const top = (gx) => pathY(gx) - 9;
  const bot = (gx) => pathY(gx) + 9;
  let d = `M0 ${r1(top(off))}`;
  for (let x = 16; x <= W; x += 16) d += ` L${pt(x, top(off + x))}`;
  for (let x = W; x >= 0; x -= 16) d += ` L${pt(x, bot(off + x))}`;
  b += path(`${d}Z`, { fill: P.path, stroke: P.pathEdge, 'stroke-width': 1.8, 'data-part': 'trail' });
  return svg(W, H, `data-habitat="${id}" data-layer="ground"`, b);
}

function reedClump(x, y, s, withCattail) {
  let b = '';
  for (let i = -2; i <= 2; i++) {
    const h = (38 + Math.abs(i) * -5 + 8) * s;
    b += path(`M${pt(x + i * 4 * s, y)} Q${pt(x + i * 6 * s, y - h * 0.6)} ${pt(x + i * 9 * s, y - h)}`, { fill: 'none', stroke: P.reedLine, 'stroke-width': 4.2 * s, 'stroke-linecap': 'round' });
    b += path(`M${pt(x + i * 4 * s, y)} Q${pt(x + i * 6 * s, y - h * 0.6)} ${pt(x + i * 9 * s, y - h)}`, { fill: 'none', stroke: P.reed, 'stroke-width': 2.2 * s, 'stroke-linecap': 'round' });
  }
  if (withCattail) b += ellipse(x + 5 * s, y - 44 * s, 3.6 * s, 9 * s, { fill: '#9A6B45', stroke: '#6F4E37', 'stroke-width': 1.4 });
  return b;
}
function tuft(x, y, s, c1, c2) {
  let b = '';
  for (let i = -3; i <= 3; i++) b += grassBlade(x + i * 4 * s, y, (16 - Math.abs(i) * 2) * s, i * 2.4 * s, i % 2 ? c1 : c2);
  return b;
}
function pebble(x, y, rx, ry) {
  return ellipse(x, y, rx, ry, { fill: '#D6CFC2', stroke: '#9C9384', 'stroke-width': 1.6 });
}

function foregroundLayer(id, off) {
  const rng = mulberry32(off + 101);
  let b = '';
  for (let x = 10; x < W; x += 38 + rng() * 40) {
    const y = H - 4 - rng() * 10;
    const s = 1.1 + rng() * 0.7;
    if (id === 'origin_warm_rocks') {
      b += rng() < 0.5 ? tuft(x, y, s * 0.9, '#C6B276', '#B09A5E') : pebble(x, y - 4, 9 * s, 5 * s);
    } else if (id === 'origin_pondbank' && (x < 120 || x > 820)) {
      b += reedClump(x, y + 2, s * 1.1, rng() < 0.5);
    } else {
      b += tuft(x, y, s, P.grassDark, lerpStops(P.groundFront, off + x));
      if (id === 'origin_meadow' && rng() < 0.35) b += flower(x + 6, y - 14 * s, rng() < 0.5 ? P.flowerPink : P.flowerYellow, 1.2);
    }
  }
  // Góc tiền cảnh: lá to (đồng cỏ/bờ hồ) hoặc đá (đá ấm), bán trong suốt nhẹ để không che rồng.
  if (id === 'origin_warm_rocks') {
    b += path(`M${W} ${H} L${W - 110} ${H} Q${W - 96} ${H - 46} ${W - 40} ${H - 58} Q${W} ${H - 60} ${W} ${H - 30}Z`, { fill: P.stone, stroke: P.stoneLine, 'stroke-width': 2.4 });
  } else {
    for (const [x, a] of [[-6, -60], [26, -80], [8, -40]]) {
      const rad = (a * Math.PI) / 180;
      const tx = x + Math.cos(rad) * 90;
      const ty = H + Math.sin(rad) * 90;
      b += path(`M${pt(x, H)} Q${pt((x + tx) / 2 + 18, (H + ty) / 2)} ${pt(tx, ty)} Q${pt((x + tx) / 2 - 12, (H + ty) / 2)} ${pt(x, H)}Z`, { fill: P.leafDark, stroke: P.grassLine, 'stroke-width': 2 });
    }
  }
  return svg(W, H, `data-habitat="${id}" data-layer="foreground"`, `<g opacity=".96">${b}</g>`);
}

// ---------------------------------------------------------------- props
// Vật thể đặt riêng, neo đáy giữa (x = w/2, y = h - 4). Viền như rồng, đọc được ở 50%.
const SW = { 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
const PROPS = {
  tree_round: [200, 260, () => {
    let b = path('M92 256 L96 150 Q80 128 60 124 M96 168 L104 150 Q122 132 146 128 M104 256 L106 150', { fill: 'none', stroke: P.trunkLine, 'stroke-width': 6, 'stroke-linecap': 'round' });
    b += path('M88 256 L92 160 L108 160 L112 256Z', { fill: P.trunk, stroke: P.trunkLine, ...SW });
    // Cành đậu (perch) chìa sang phải.
    b += path('M106 170 Q140 160 176 164', { fill: 'none', stroke: P.trunkLine, 'stroke-width': 9, 'stroke-linecap': 'round' });
    b += path('M106 170 Q140 160 176 164', { fill: 'none', stroke: P.trunk, 'stroke-width': 5, 'stroke-linecap': 'round', 'data-part': 'perch-branch' });
    for (const [x, y, r] of [[100, 70, 52], [56, 104, 38], [146, 100, 40], [100, 120, 44], [70, 62, 30], [132, 58, 30]]) b += circle(x, y, r, { fill: P.leaf, stroke: P.grassLine, 'stroke-width': 2.5 });
    for (const [x, y, r] of [[90, 60, 18], [130, 88, 14], [60, 96, 12]]) b += circle(x, y, r, { fill: '#A6D49F', opacity: 0.9 });
    return b;
  }],
  bush_berry: [120, 90, () => {
    let b = '';
    for (const [x, y, r] of [[40, 60, 26], [80, 58, 28], [60, 40, 26]]) b += circle(x, y, r, { fill: P.leafDark, stroke: P.grassLine, 'stroke-width': 2.5 });
    for (const [x, y] of [[36, 52], [52, 34], [70, 50], [88, 44], [62, 66], [92, 66], [44, 72]]) b += circle(x, y, 5, { fill: P.berry, stroke: '#86392E', 'stroke-width': 1.6 }) + circle(x - 1.5, y - 1.5, 1.4, { fill: '#FFFFFF' });
    return b;
  }],
  flower_patch: [110, 50, () => {
    let b = ellipse(55, 40, 50, 9, { fill: '#8CC48A', opacity: 0.8 });
    const cs = [P.flowerPink, P.flowerYellow, P.flowerWhite, P.flowerPink, P.flowerYellow];
    [[18, 36], [34, 26], [52, 34], [70, 24], [88, 34], [44, 42], [76, 42]].forEach(([x, y], i) => {
      b += path(`M${x} 46 L${x} ${y + 3}`, { stroke: P.grassLine, 'stroke-width': 1.8 }) + flower(x, y, cs[i % 5], 1.5);
    });
    return b;
  }],
  moss_bed: [130, 44, () => ellipse(65, 30, 60, 13, { fill: '#9CCB7E', stroke: P.grassLine, 'stroke-width': 2.5 }) + ellipse(56, 26, 38, 6, { fill: '#B5DB98' }) + [[22, 30], [100, 32], [64, 36]].map(([x, y]) => circle(x, y, 2, { fill: '#E7F3C9' })).join('')],
  stump: [90, 70, () => path('M18 66 L22 26 L68 26 L72 66Z', { fill: P.trunk, stroke: P.trunkLine, ...SW }) + ellipse(45, 26, 23, 8, { fill: '#D8B48C', stroke: P.trunkLine, 'stroke-width': 2.5, 'data-part': 'perch-top' }) + ellipse(45, 26, 12, 4, { fill: 'none', stroke: P.trunkLine, 'stroke-width': 1.4 }) + path('M30 40 l2 10 M58 44 l-2 10', { stroke: P.trunkLine, 'stroke-width': 1.6 })],
  boulder_small: [70, 50, () => path('M8 46 Q4 22 26 14 Q50 8 62 26 Q68 42 62 46Z', { fill: '#CFC6B6', stroke: '#8E8475', ...SW }) + path('M24 22 Q34 18 42 22', { fill: 'none', stroke: '#F2ECE1', 'stroke-width': 3, 'stroke-linecap': 'round' })],
  reeds_cluster: [90, 120, () => reedClump(45, 116, 1.9, true)],
  lily_pads: [140, 40, () => {
    let b = '';
    for (const [x, y, r] of [[28, 22, 18], [70, 16, 14], [98, 28, 11]]) b += path(`M${x} ${y} L${x + r} ${y - 4} A${r} ${r * 0.55} 0 1 1 ${x + r} ${y + 3}Z`, { fill: '#8CC48A', stroke: '#5E8F57', 'stroke-width': 2 });
    return b + flower(72, 12, P.flowerPink, 1.6);
  }],
  log_old: [180, 70, () => path('M14 60 Q10 30 30 26 L150 22 Q170 24 170 44 Q170 62 150 62 L30 64 Q16 64 14 60Z', { fill: P.trunk, stroke: P.trunkLine, ...SW, 'data-part': 'perch-top' }) + ellipse(156, 42, 14, 18, { fill: '#D8B48C', stroke: P.trunkLine, 'stroke-width': 2.5 }) + ellipse(156, 42, 6, 8, { fill: 'none', stroke: P.trunkLine, 'stroke-width': 1.4 }) + ellipse(70, 26, 26, 6, { fill: '#9CCB7E', stroke: P.grassLine, 'stroke-width': 2 }) + path('M40 44 L110 42', { stroke: P.trunkLine, 'stroke-width': 1.6 })],
  mud_wallow: [150, 40, () => ellipse(75, 24, 68, 13, { fill: '#BFA37A', stroke: P.mudLine, 'stroke-width': 2.5 }) + ellipse(70, 22, 40, 6, { fill: '#CDB58A' }) + circle(110, 22, 3, { fill: '#A58B62' })],
  drinking_stone: [90, 50, () => path('M6 46 Q8 20 40 16 Q76 14 84 38 L84 46Z', { fill: '#CFC6B6', stroke: '#8E8475', ...SW }) + ellipse(46, 22, 18, 4, { fill: P.water, stroke: P.waterLine, 'stroke-width': 1.6 })],
  flat_warm_stone: [180, 60, () => path('M8 52 Q10 22 50 16 L140 14 Q174 20 172 46 L170 54Z', { fill: P.stone, stroke: P.stoneLine, ...SW, 'data-part': 'bask-surface' }) + path('M40 22 L140 20', { stroke: '#F4DEC0', 'stroke-width': 4, 'stroke-linecap': 'round' }) + path('M60 34 l14 6 l12 -4 M118 30 l10 8', { fill: 'none', stroke: P.stoneShade, 'stroke-width': 2, 'stroke-linecap': 'round' })],
  rock_spire: [110, 200, () => path('M14 196 Q22 120 40 70 Q48 30 62 14 Q74 30 80 70 Q94 130 98 196Z', { fill: P.stone, stroke: P.stoneLine, ...SW }) + path('M50 40 Q56 20 62 14 Q68 22 72 40Z', { fill: '#EED7B8', stroke: P.stoneLine, 'stroke-width': 2, 'data-part': 'perch-top' }) + path('M40 110 l14 10 M70 140 l-10 12 M36 160 l12 6', { fill: 'none', stroke: P.stoneShade, 'stroke-width': 2.2, 'stroke-linecap': 'round' })],
  boulder_large: [160, 120, () => path('M10 116 Q4 60 46 34 Q90 10 128 40 Q156 66 150 116Z', { fill: '#D9B998', stroke: P.stoneLine, ...SW }) + path('M44 50 Q70 32 98 40', { fill: 'none', stroke: '#F2DDC2', 'stroke-width': 5, 'stroke-linecap': 'round' }) + path('M100 80 l16 12 M60 92 l-12 10', { fill: 'none', stroke: P.stoneShade, 'stroke-width': 2.2, 'stroke-linecap': 'round' })],
  dry_grass: [80, 50, () => tuft(40, 48, 2, '#C6B276', '#B09A5E')],
  warm_vent: [90, 60, () => path('M8 56 Q14 30 34 26 L58 26 Q80 30 84 56Z', { fill: P.stoneShade, stroke: P.stoneLine, ...SW }) + ellipse(46, 28, 14, 5, { fill: '#F3B07A', stroke: P.stoneLine, 'stroke-width': 2, 'data-part': 'warm-source' }) + ellipse(46, 28, 7, 2.4, { fill: '#FFE1A8' })],
};

// ---------------------------------------------------------------- environment FX
const FX = {
  pollen: [24, 24, circle(12, 12, 4, { fill: '#FFF4B8', stroke: '#E1C56A', 'stroke-width': 1.4 }) + circle(12, 12, 9, { fill: '#FFF4B8', opacity: 0.3 })],
  petal: [20, 20, path('M10 2 Q18 8 10 18 Q2 8 10 2Z', { fill: P.flowerPink, stroke: '#C77D97', 'stroke-width': 1.4 })],
  butterfly_a: [32, 24, path('M16 12 Q4 0 3 8 Q2 16 16 13Z M16 12 Q28 0 29 8 Q30 16 16 13Z', { fill: '#FFE59A', stroke: '#B8913A', 'stroke-width': 1.6 }) + path('M16 6 L16 18', { stroke: P.ink, 'stroke-width': 2, 'stroke-linecap': 'round' })],
  butterfly_b: [32, 24, path('M16 12 Q10 2 8 9 Q7 15 16 13Z M16 12 Q22 2 24 9 Q25 15 16 13Z', { fill: '#FFE59A', stroke: '#B8913A', 'stroke-width': 1.6 }) + path('M16 6 L16 18', { stroke: P.ink, 'stroke-width': 2, 'stroke-linecap': 'round' })],
  dragonfly: [40, 24, path('M6 12 L34 12', { stroke: '#4F93AE', 'stroke-width': 3, 'stroke-linecap': 'round' }) + ellipse(16, 6, 9, 3.4, { fill: '#E3F6FB', stroke: '#7FC4D8', 'stroke-width': 1.2 }) + ellipse(16, 18, 9, 3.4, { fill: '#E3F6FB', stroke: '#7FC4D8', 'stroke-width': 1.2 }) + circle(35, 12, 3, { fill: '#4F93AE' })],
  water_glint: [32, 16, path('M2 10 Q16 2 30 10', { fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.6, 'stroke-linecap': 'round' }) + path('M10 13 Q16 10 22 13', { fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0.8 })],
  firefly: [16, 16, circle(8, 8, 7, { fill: '#FFF3A6', opacity: 0.35 }) + circle(8, 8, 3, { fill: '#FFF3A6', stroke: '#D7B94A', 'stroke-width': 1 })],
  heat_haze: [64, 48, path('M8 44 Q14 34 8 24 Q2 14 8 4 M30 44 Q36 34 30 24 Q24 14 30 4 M52 44 Q58 34 52 24 Q46 14 52 4', { fill: 'none', stroke: '#F6C99A', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.7 })],
  dust_mote: [12, 12, circle(6, 6, 3.2, { fill: '#F1E2C2', stroke: '#C9AF84', 'stroke-width': 1 })],
  steam_puff: [40, 40, circle(14, 26, 9, { fill: '#FFFFFF', opacity: 0.7 }) + circle(24, 18, 11, { fill: '#FFFFFF', opacity: 0.7 }) + circle(20, 10, 6, { fill: '#FFFFFF', opacity: 0.6 })],
};

// ---------------------------------------------------------------- undiscovered
function mistLayer() {
  // Sương mềm: các dải elip làm mờ bằng feGaussianBlur nội bộ (Canvas drawImage hỗ trợ).
  let b = `<defs><filter id="origin-mist-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="22"/></filter></defs>`;
  b += rect(0, 0, W, H, { fill: '#EEF1F0', opacity: 0.5 });
  const rng = mulberry32(404);
  let g = '';
  for (let i = 0; i < 18; i++) {
    const x = rng() * W;
    const y = 180 + rng() * 360;
    g += ellipse(x, y, 160 + rng() * 140, 30 + rng() * 26, { fill: '#FFFFFF', opacity: 0.5 + rng() * 0.3 });
  }
  b += `<g filter="url(#origin-mist-blur)">${g}</g>`;
  return svg(W, H, 'data-layer="undiscovered-mist"', b);
}
function marker(icon) {
  // Biển gỗ nhỏ + biểu tượng khám phá (không chữ). Thông tin "cần khám phá gì" ở UI qua t(key).
  let b = path('M44 124 L44 54', { stroke: P.trunkLine, 'stroke-width': 7, 'stroke-linecap': 'round' }) + path('M44 124 L44 54', { stroke: P.trunk, 'stroke-width': 4, 'stroke-linecap': 'round' });
  b += path('M8 14 Q8 6 16 6 L72 6 Q80 6 80 14 L80 52 Q80 60 72 60 L16 60 Q8 60 8 52Z', { fill: '#F6E9CF', stroke: P.trunkLine, 'stroke-width': 3 });
  if (icon === 'thermal') {
    b += circle(44, 28, 9, { fill: '#FFD66C', stroke: '#B8913A', 'stroke-width': 2 });
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 * Math.PI) / 180;
      b += path(`M${pt(44 + Math.cos(a) * 13, 28 + Math.sin(a) * 13)} L${pt(44 + Math.cos(a) * 17, 28 + Math.sin(a) * 17)}`, { stroke: '#B8913A', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    }
    b += path('M24 54 Q30 44 44 44 Q60 44 66 54Z', { fill: P.stone, stroke: P.stoneLine, 'stroke-width': 2 });
  } else if (icon === 'aquatic') {
    b += path('M44 12 Q58 30 56 40 Q54 52 44 52 Q34 52 32 40 Q30 30 44 12Z', { fill: P.water, stroke: P.waterLine, 'stroke-width': 2.4 });
    b += path('M38 38 Q40 44 46 46', { fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
  } else {
    // generic: la bàn khám phá.
    b += circle(44, 33, 18, { fill: '#FFFFFF', stroke: P.trunkLine, 'stroke-width': 2.4 });
    b += path('M44 18 L49 33 L44 48 L39 33Z', { fill: '#E7B864', stroke: P.trunkLine, 'stroke-width': 1.6 });
  }
  b += circle(80, 8, 10, { fill: '#FFFFFF', stroke: '#2B2B3A', 'stroke-width': 2.4 }) + path('M76 8 Q76 3 80 3 Q84 3 84 7 Q84 10 80 11 L80 13 M80 16 L80 16.5', { fill: 'none', stroke: '#2B2B3A', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
  return svg(96, 128, `data-layer="undiscovered-marker" data-icon="${icon}"`, b);
}

// ---------------------------------------------------------------- write
const write = (rel, content) => {
  const f = join(OUT, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, content);
};
let n = 0;
for (const [id, off] of Object.entries(HABITATS)) {
  write(`${id}/sky.svg`, skyLayer(id, off));
  write(`${id}/far.svg`, farLayer(id, off));
  write(`${id}/mid.svg`, midLayer(id, off));
  write(`${id}/ground.svg`, groundLayer(id, off));
  write(`${id}/foreground.svg`, foregroundLayer(id, off));
  n += 5;
}
for (const [pid, [w, h, draw]] of Object.entries(PROPS)) {
  write(`props/${pid}.svg`, svg(w, h, `data-prop="${pid}"`, draw()));
  n++;
}
for (const [fid, [w, h, body]] of Object.entries(FX)) {
  write(`fx/${fid}.svg`, svg(w, h, `data-effect="${fid}"`, body));
  n++;
}
write('undiscovered/mist.svg', mistLayer());
for (const icon of ['thermal', 'aquatic', 'generic']) write(`undiscovered/marker_${icon}.svg`, marker(icon));
n += 4;
// Hình học dùng chung cho manifest (một nguồn: cùng hàm đã vẽ).
const polyPts = (d) => [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const geometry = { scene: { width: W, height: H }, habitatOffsetX: HABITATS, habitats: {} };
for (const [id, off] of Object.entries(HABITATS)) {
  const walkTop = [];
  for (let x = 0; x <= W; x += 60) walkTop.push([x, Math.round(groundTop(off + x) + 26)]);
  const trail = [];
  for (let x = 0; x <= W; x += 60) trail.push([x, Math.round(pathY(off + x))]);
  geometry.habitats[id] = {
    walkArea: [...walkTop, [W, H - 12], [0, H - 12]],
    trail,
    water: id === 'origin_pondbank' ? polyPts(pondD(0)) : null,
    stoneSlabs: id === 'origin_warm_rocks' ? SLABS : [],
  };
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'geometry.json'), `${JSON.stringify(geometry)}\n`);
console.log(`Generated ${n} Origin habitat SVGs + geometry.json in ${OUT}`);
