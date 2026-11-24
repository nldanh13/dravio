#!/usr/bin/env node
/**
 * Dravio — trình sinh sprite Common (Droplet, Sproutling `sprout`, Zephyr).
 *
 * Chạy: `node scripts/art/generate-common-dragons.mjs`
 * Đầu ra: `src/assets/dragons/common/<speciesId>/<stage>_<mutation>.svg` (36 file).
 *
 * Nguyên tắc (docs/art/COMMON_DRAGONS.md):
 *  - Mỗi loài có hình học riêng cho từng stage (không phóng to một hình chung).
 *  - Các lớp SVG tách biệt, phẳng (không lồng <g>):
 *      shadow → body (giải phẫu + pigment) → pattern (hoa văn kiểu hình)
 *      → aether-tint (lớp phủ biến thể, clip theo silhouette) → eye (kiểu hình mắt)
 *      → aether-fx (motif hình học của biến thể) → badge (huy hiệu đơn sắc).
 *  - Biến thể Aether KHÔNG sửa body/pattern/eye: ba lớp này giống hệt nhau giữa
 *    Normal/Crystal/Golden/Prismatic của cùng một stage (test khóa quy tắc).
 *  - Không script, không tham chiếu ngoài; id nội bộ có tiền tố duy nhất.
 *  - Không dùng Math.random: hình học hoàn toàn xác định.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'assets', 'dragons', 'common');

/** Khung chung với Emberling G0: 240×200, điểm neo chân (120,170). */
const W = 240;
const H = 200;
const ANCHOR = { x: 120, y: 170 };
const GROUND = 169;
const STAGE_SCALE = { baby: 0.68, juvenile: 0.85, adult: 1 };
const STAGES = ['baby', 'juvenile', 'adult'];
const MUTATIONS = ['normal', 'crystal', 'golden', 'prismatic'];
const INK = '#3A303A';

// Palette canonical từ src/data/g0Biology.ts (kiểm tra lại bằng test).
const PALETTES = {
  droplet: { primary: '#61BBD0', secondary: '#337FA4', belly: '#C7F2EE', accent: '#86E5DE' },
  sprout: { primary: '#75B57D', secondary: '#397C58', belly: '#E3EAC0', accent: '#E7B864' },
  zephyr: { primary: '#A6C8E6', secondary: '#6388BA', belly: '#EDF4FC', accent: '#F5D999' },
};

// ---------------------------------------------------------------- helpers
const r1 = (n) => {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? '0' : String(v);
};
const pt = (x, y) => `${r1(x)} ${r1(y)}`;
const rad = (deg) => (deg * Math.PI) / 180;

/** Phần tử SVG; `clip:false` loại khỏi silhouette dùng cho clipPath. */
function el(markup, clip = true) {
  return { markup, clip };
}
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${typeof v === 'number' ? r1(v) : v}"`)
    .join(' ');
const ellipse = (cx, cy, rx, ry, a = {}) => `<ellipse ${attrs({ cx, cy, rx, ry, ...a })}/>`;
const circle = (cx, cy, r, a = {}) => `<circle ${attrs({ cx, cy, r, ...a })}/>`;
const path = (d, a = {}) => `<path ${attrs({ d, ...a })}/>`;

/** Lá/thùy hình giọt: gốc (x,y), hướng `deg`, dài `len`, nửa bề rộng `w`. */
function leafD(x, y, deg, len, w) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const tx = x + len * c;
  const ty = y + len * s;
  const mx = x + len * 0.5 * c;
  const my = y + len * 0.5 * s;
  const px = -s * w * 2;
  const py = c * w * 2;
  return `M${pt(x, y)} Q${pt(mx + px, my + py)} ${pt(tx, ty)} Q${pt(mx - px, my - py)} ${pt(x, y)}Z`;
}
function veinD(x, y, deg, len) {
  return `M${pt(x, y)} L${pt(x + len * 0.78 * Math.cos(rad(deg)), y + len * 0.78 * Math.sin(rad(deg)))}`;
}

// ------------------------------------------------------------- DROPLET
// Lưỡng cư (A): thân thấp tròn, vây tai dạng tua, đuôi dẹt mái chèo, màng chân.
const DROPLET = {
  baby: { bx: 113, by: 141, brx: 41, bry: 26, hx: 160, hy: 108, hrx: 33, hry: 29, lobes: 1, dorsal: 0, tail: 24, eye: [7.4, 8.6], spots: 2 },
  juvenile: { bx: 112, by: 139, brx: 46, bry: 28, hx: 163, hy: 106, hrx: 30, hry: 26, lobes: 2, dorsal: 3, tail: 36, eye: [6.9, 8], spots: 4 },
  adult: { bx: 110, by: 137, brx: 51, bry: 30, hx: 166, hy: 104, hrx: 28, hry: 24, lobes: 3, dorsal: 5, tail: 46, eye: [6.5, 7.6], spots: 6 },
};

function webFoot(x, y, fill, stroke) {
  const d =
    `M${pt(x - 10, y - 7)} Q${pt(x - 16, y + 1)} ${pt(x - 10, y + 3)} Q${pt(x - 6, y + 1)} ${pt(x - 3, y + 4)}` +
    ` Q${pt(x + 1, y + 1)} ${pt(x + 4, y + 4)} Q${pt(x + 8, y + 1)} ${pt(x + 12, y + 3)} Q${pt(x + 14, y - 4)} ${pt(x + 8, y - 8)}Z`;
  return path(d, { fill, stroke, 'stroke-width': 2, 'data-part': 'webbed-foot' });
}

function droplet(stage) {
  const p = DROPLET[stage];
  const c = PALETTES.droplet;
  const body = [];
  const pattern = [];
  const eye = [];
  const { bx, by, brx, bry, hx, hy, hrx, hry } = p;

  // Đuôi mái chèo (dẹt theo chiều dọc) + màng vây đuôi.
  const x0 = bx - brx + 14;
  const L = p.tail;
  const tailD = (k) =>
    `M${pt(x0, by - 14 - k * 0.5)} Q${pt(x0 - L * 0.5, by - 17 - k)} ${pt(x0 - L, by - 15 - k)}` +
    ` C${pt(x0 - L - 13 - k, by - 14 - k)} ${pt(x0 - L - 11 - k, by + 4 + k)} ${pt(x0 - L + 2, by + 3 + k * 0.6)}` +
    ` Q${pt(x0 - L * 0.4, by + 15 + k * 0.5)} ${pt(x0, by + 14)}Z`;
  if (stage !== 'baby') body.push(el(path(tailD(stage === 'adult' ? 7 : 4), { fill: c.accent, 'data-part': 'tail-fin' })));
  body.push(el(path(tailD(0), { fill: c.primary, 'data-part': 'paddle-tail' })));
  // Vây lưng dạng sóng (Juvenile/Adult), nằm sau thân.
  if (p.dorsal > 0) {
    const xs = bx + brx * 0.55;
    const xe = bx - brx * 0.75;
    const top = by - bry + 3;
    const h = stage === 'adult' ? 15 : 10;
    let d = `M${pt(xs, top + 4)}`;
    for (let i = 0; i < p.dorsal; i++) {
      const a = xs + ((xe - xs) * i) / p.dorsal;
      const b = xs + ((xe - xs) * (i + 1)) / p.dorsal;
      d += ` Q${pt((a + b) / 2 + 2, top - h)} ${pt(b, top + 2)}`;
    }
    d += ` L${pt(xe, by)} L${pt(xs, by)}Z`;
    body.push(el(path(d, { fill: c.accent, 'data-part': 'dorsal-fin' })));
  }
  // Chân xa (tối hơn).
  for (const lx of [bx - 30, bx + 22]) {
    body.push(el(path(`M${pt(lx - 8, by + 6)} L${pt(lx - 8, GROUND - 6)} Q${pt(lx + 1, GROUND)} ${pt(lx + 9, GROUND - 6)} L${pt(lx + 8, by + 6)}Z`, { fill: c.secondary })));
  }
  // Thân + bụng.
  body.push(el(ellipse(bx, by, brx, bry, { fill: c.primary })));
  body.push(el(ellipse(bx + 12, by + 9, brx * 0.55, bry * 0.5, { fill: c.belly, stroke: 'none' })));
  // Chân gần + màng chân.
  for (const lx of [bx - 22, bx + 30]) {
    body.push(el(path(`M${pt(lx - 9, by + 6)} L${pt(lx - 9, GROUND - 9)} Q${pt(lx, GROUND - 3)} ${pt(lx + 9, GROUND - 9)} L${pt(lx + 9, by + 6)}Z`, { fill: c.primary })));
    body.push(el(webFoot(lx, GROUND - 1, c.accent, c.secondary)));
  }
  // Vây tai (tua) phía sau đầu.
  const ax = hx - hrx * 0.45;
  const ay = hy - hry * 0.2;
  const lobeSet = { 1: [[-135, 20, 6.5]], 2: [[-160, 26, 6.5], [-122, 26, 6.5]], 3: [[-172, 30, 6.5], [-142, 34, 7.2], [-112, 28, 6.5]] }[p.lobes];
  for (const [deg, len, w] of lobeSet) {
    body.push(el(path(leafD(ax, ay, deg, len, w), { fill: c.accent, 'data-part': 'ear-fin' })));
    body.push(el(path(veinD(ax, ay, deg, len), { fill: 'none', 'stroke-width': 1.4 }), false));
  }
  // Đầu rộng kiểu ếch, mõm rộng.
  body.push(el(ellipse(hx, hy, hrx, hry, { fill: c.primary })));
  body.push(el(ellipse(hx + hrx * 0.6, hy + hry * 0.4, hrx * 0.62, hry * 0.42, { fill: c.belly })));
  body.push(el(circle(hx + hrx * 1.08, hy + hry * 0.12, 1.9, { fill: c.secondary, stroke: 'none' }), false));
  body.push(el(path(`M${pt(hx + hrx * 0.38, hy + hry * 0.52)} Q${pt(hx + hrx * 0.78, hy + hry * 0.78)} ${pt(hx + hrx * 1.1, hy + hry * 0.44)}`, { fill: 'none', 'stroke-width': 1.8 }), false));

  // Pattern (kiểu hình di truyền — tham chiếu "medium"): đốm lưng + vệt giọt trên trán.
  const spots = [
    [bx + 18, by - bry + 9, 3.4],
    [bx - 2, by - bry + 7, 3.8],
    [bx - 22, by - bry + 10, 3.4],
    [bx + 6, by - bry + 17, 2.6],
    [bx - 36, by - bry + 16, 2.8],
    [bx - 12, by - bry + 18, 2.4],
  ].slice(0, p.spots);
  for (const [x, y, rr] of spots) pattern.push(circle(x, y, rr, { fill: c.secondary, opacity: 0.45 }));
  pattern.push(path(`M${pt(hx - 4, hy - hry + 3)} q4 6 0 10 q-4 -4 0 -10Z`, { fill: c.secondary, opacity: 0.45 }));

  // Mắt to tròn.
  const ex = hx + hrx * 0.25;
  const ey = hy - hry * 0.14;
  eye.push(ellipse(ex, ey, p.eye[0], p.eye[1], { fill: INK }));
  eye.push(circle(ex + 2.2, ey - 3, 2.4, { fill: '#FFFFFF' }));
  eye.push(circle(ex - 2, ey + 3, 1.1, { fill: '#FFFFFF' }));

  return {
    outline: c.secondary,
    body,
    pattern,
    eye,
    fx: {
      halo: [hx, hy - hry - (stage === 'adult' ? 22 : 16), hrx * 0.85],
      facets: [[bx - 8, by - 6], [bx + 14, by - 12], [bx - 30, by], [x0 - L * 0.6, by - 6]],
      sparkles: [[hx + hrx + 14, hy - hry - 4], [bx - brx - 6, by - bry - 10]],
      streak: `M${pt(bx - brx + 8, by - 4)} Q${pt(bx - 10, by - bry - 4)} ${pt(bx + brx * 0.6, by - bry + 4)}`,
    },
  };
}

// ------------------------------------------------------------- SPROUT
// Đất liền (T): thân chắc, mầm lá trên đầu, tai lá, tấm lá lưng, đuôi lá, móng đào đất.
const SPROUT = {
  baby: { bx: 113, by: 139, brx: 40, bry: 27, hx: 158, hy: 106, r: 31, stem: 11, leaf: 12, crown: 'seed', plates: 0, tailLeaf: 17, claws: 0, eye: [6.8, 8.2], spots: 2 },
  juvenile: { bx: 111, by: 135, brx: 45, bry: 30, hx: 160, hy: 100, r: 28, stem: 19, leaf: 16, crown: 'bud', plates: 2, tailLeaf: 24, claws: 1, eye: [6.3, 7.6], spots: 3 },
  adult: { bx: 110, by: 131, brx: 49, bry: 33, hx: 161, hy: 96, r: 26, stem: 27, leaf: 20, crown: 'flower', plates: 3, tailLeaf: 31, claws: 2, eye: [6, 7.2], spots: 4 },
};
const SPROUT_LEAF = '#A9D08E';

function sprout(stage) {
  const p = SPROUT[stage];
  const c = PALETTES.sprout;
  const body = [];
  const pattern = [];
  const eye = [];
  const { bx, by, brx, bry, hx, hy, r } = p;

  // Đuôi dày cong lên, kết thúc bằng một chiếc lá.
  const tx = bx - brx - 14 - p.tailLeaf * 0.3;
  const ty = by - 22 - p.tailLeaf * 0.25;
  body.push(el(path(`M${pt(bx - brx + 14, by - 8)} Q${pt(bx - brx - 4, by - 6)} ${pt(tx, ty)} Q${pt(bx - brx - 8, by + 12)} ${pt(bx - brx + 16, by + 14)}Z`, { fill: c.primary })));
  body.push(el(path(leafD(tx + 2, ty + 2, -128, p.tailLeaf, p.tailLeaf * 0.22), { fill: SPROUT_LEAF, 'data-part': 'leaf-tail' })));
  body.push(el(path(veinD(tx + 2, ty + 2, -128, p.tailLeaf), { fill: 'none', 'stroke-width': 1.5 }), false));
  // Tấm lá trên lưng (thay cho gai nhọn của Emberling).
  const plateAt = [
    [bx + 10, by - bry + 4, -100],
    [bx - 10, by - bry + 3, -118],
    [bx - 28, by - bry + 9, -136],
  ].slice(0, p.plates);
  for (const [x, y, deg] of plateAt) {
    body.push(el(path(leafD(x, y, deg, 19, 4.6), { fill: SPROUT_LEAF, 'data-part': 'leaf-plate' })));
    body.push(el(path(veinD(x, y, deg, 19), { fill: 'none', 'stroke-width': 1.3 }), false));
  }
  // Chân xa.
  for (const lx of [bx - 28, bx + 24]) {
    body.push(el(path(`M${pt(lx - 10, by + 8)} L${pt(lx - 10, GROUND - 5)} Q${pt(lx + 1, GROUND + 1)} ${pt(lx + 12, GROUND - 5)} L${pt(lx + 10, by + 8)}Z`, { fill: c.secondary })));
  }
  body.push(el(ellipse(bx, by, brx, bry, { fill: c.primary })));
  body.push(el(ellipse(bx + 13, by + 10, brx * 0.52, bry * 0.52, { fill: c.belly, stroke: 'none' })));
  // Chân gần, dày; móng xẻng (đào đất) ở chân trước.
  const near = [bx - 20, bx + 30];
  near.forEach((lx, i) => {
    body.push(el(path(`M${pt(lx - 12, by + 8)} L${pt(lx - 12, GROUND - 9)} Q${pt(lx - 13, GROUND + 1)} ${pt(lx, GROUND)} Q${pt(lx + 15, GROUND + 1)} ${pt(lx + 13, GROUND - 9)} L${pt(lx + 12, by + 6)}Z`, { fill: c.primary })));
    const front = i === 1;
    if ((front && p.claws >= 1) || p.claws >= 2) {
      for (const [dx, dy] of [[4, 0], [9, -1], [13, -3]]) {
        body.push(el(path(`M${pt(lx + dx - 2.4, GROUND - 3 + dy)} l2.4 4.4 l2.4 -4.4Z`, { fill: c.accent, 'stroke-width': 1.2, 'data-part': 'digging-claw' })));
      }
    }
  });
  // Tai lá rủ ra sau.
  body.push(el(path(leafD(hx - r * 0.6, hy - r * 0.35, -172, r * 0.62, r * 0.13), { fill: SPROUT_LEAF })));
  // Đầu tròn, mõm ngắn.
  body.push(el(circle(hx, hy, r, { fill: c.primary })));
  body.push(el(ellipse(hx + r * 0.62, hy + r * 0.42, r * 0.56, r * 0.42, { fill: c.belly })));
  body.push(el(circle(hx + r * 1.05, hy + r * 0.28, 1.8, { fill: c.secondary, stroke: 'none' }), false));
  body.push(el(path(`M${pt(hx + r * 0.55, hy + r * 0.62)} Q${pt(hx + r * 0.8, hy + r * 0.8)} ${pt(hx + r * 1.02, hy + r * 0.58)}`, { fill: 'none', 'stroke-width': 1.8 }), false));
  // Mầm lá trên đỉnh đầu.
  const sx = hx - r * 0.12;
  const sy = hy - r * 0.92;
  const topX = sx - 4;
  const topY = sy - p.stem;
  body.push(el(path(`M${pt(sx, sy + 3)} Q${pt(sx + 3, sy - p.stem * 0.5)} ${pt(topX, topY)}`, { fill: 'none', 'stroke-width': 4.6 }), false));
  body.push(el(path(`M${pt(sx, sy + 3)} Q${pt(sx + 3, sy - p.stem * 0.5)} ${pt(topX, topY)}`, { fill: 'none', stroke: SPROUT_LEAF, 'stroke-width': 2 }), false));
  const wide = p.crown === 'seed' ? 0.36 : 0.27;
  body.push(el(path(leafD(topX, topY, -158, p.leaf, p.leaf * wide), { fill: SPROUT_LEAF, 'data-part': 'head-sprout' })));
  body.push(el(path(leafD(topX, topY, -28, p.leaf * 1.05, p.leaf * wide), { fill: SPROUT_LEAF })));
  if (p.crown !== 'seed') {
    body.push(el(path(leafD(sx + 1, sy - p.stem * 0.45, -10, p.leaf * 0.62, p.leaf * 0.2), { fill: SPROUT_LEAF })));
  }
  if (p.crown === 'bud') {
    body.push(el(path(`M${pt(topX, topY + 1)} q-5 -6 0 -12 q5 6 0 12Z`, { fill: c.accent })));
  } else if (p.crown === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = rad(-90 + i * 72);
      body.push(el(circle(topX + Math.cos(a) * 5.2, topY - 3 + Math.sin(a) * 5.2, 3.8, { fill: c.accent, 'stroke-width': 1.4 })));
    }
    body.push(el(circle(topX, topY - 3, 2.6, { fill: c.secondary, stroke: 'none' })));
  }

  // Pattern: đốm hình lá trên hông.
  const spots = [
    [bx + 4, by - 10, -30],
    [bx - 18, by - 4, -20],
    [bx - 6, by + 8, -35],
    [bx - 32, by + 6, -15],
  ].slice(0, p.spots);
  for (const [x, y, deg] of spots) pattern.push(path(leafD(x, y, deg, 10, 2.6), { fill: c.secondary, opacity: 0.38 }));

  const ex = hx + r * 0.3;
  const ey = hy - r * 0.06;
  eye.push(ellipse(ex, ey, p.eye[0], p.eye[1], { fill: INK }));
  eye.push(circle(ex + 2, ey - 2.8, 2.3, { fill: '#FFFFFF' }));

  return {
    outline: c.secondary,
    body,
    pattern,
    eye,
    fx: {
      halo: [topX, topY - (p.crown === 'flower' ? 18 : 13), r * 0.75],
      facets: [[bx - 6, by - 8], [bx + 16, by - 14], [bx - 26, by + 2], [hx - r * 0.35, hy + r * 0.1]],
      sparkles: [[hx + r + 16, hy - r + 4], [bx - brx - 4, by + 14]],
      streak: `M${pt(bx - brx + 10, by - 2)} Q${pt(bx - 8, by - bry - 6)} ${pt(bx + brx * 0.6, by - bry + 6)}`,
    },
  };
}

// ------------------------------------------------------------- ZEPHYR
// Bay (V): dáng đứng thẳng hai chân đậu, cánh lông rộng, đuôi mây, lông cổ, chỏm lông.
const ZEPHYR = {
  baby: { bx: 114, by: 133, brx: 31, bry: 28, hx: 153, hy: 96, r: 30, wing: [-14, -26, -42, -18], feathers: 3, tail: 40, puffs: 2, tufts: 1, eye: [7, 8.4], chevrons: 1 },
  juvenile: { bx: 113, by: 128, brx: 32, bry: 30, hx: 154, hy: 87, r: 26, wing: [-24, -40, -68, -34], feathers: 4, tail: 54, puffs: 3, tufts: 2, eye: [6.6, 8], chevrons: 2 },
  adult: { bx: 112, by: 123, brx: 33, bry: 32, hx: 156, hy: 80, r: 23, wing: [-32, -54, -94, -46], feathers: 5, tail: 68, puffs: 3, tufts: 3, eye: [6.3, 7.6], chevrons: 3 },
};

function wingGeom(sx, sy, w) {
  const [wxo, wyo, txo, tyo] = w;
  return { S: [sx, sy], W1: [sx + wxo, sy + wyo], T: [sx + txo, sy + tyo], R: [sx - 16, sy + 8] };
}
/** Cánh lông: mép trước cong lên cổ tay rồi tới đầu cánh; mép sau gồm `feathers` lông bay vỏ sò. */
function wingD(sx, sy, w, feathers) {
  const { S, W1, T, R } = wingGeom(sx, sy, w);
  let d = `M${pt(S[0], S[1])} Q${pt(S[0] + (W1[0] - S[0]) * 0.1, W1[1] + 6)} ${pt(W1[0], W1[1])} Q${pt(W1[0] + (T[0] - W1[0]) * 0.55, W1[1] - 6)} ${pt(T[0], T[1])}`;
  // Mép sau võng xuống: Bezier bậc 2 từ T qua C tới R.
  const C = [(T[0] + R[0]) / 2 - 2, Math.max(T[1], R[1]) + 16];
  const at = (t) => [
    (1 - t) ** 2 * T[0] + 2 * (1 - t) * t * C[0] + t * t * R[0],
    (1 - t) ** 2 * T[1] + 2 * (1 - t) * t * C[1] + t * t * R[1],
  ];
  const joints = [];
  let prev = T;
  for (let i = 1; i <= feathers; i++) {
    const q = at(i / feathers);
    const mx = (prev[0] + q[0]) / 2;
    const my = (prev[1] + q[1]) / 2;
    d += ` Q${pt(mx - 5, my + 9)} ${pt(q[0], q[1])}`;
    joints.push(q);
    prev = q;
  }
  d += ` Q${pt(S[0] - 4, S[1] + 8)} ${pt(S[0], S[1])}Z`;
  return { d, W1, joints: joints.slice(0, -1) };
}
/** Dải lông phủ (coverts) dọc mép trước cánh. */
function covertD(sx, sy, w) {
  const { S, W1, T } = wingGeom(sx, sy, w);
  const Tc = [W1[0] + (T[0] - W1[0]) * 0.5, W1[1] + (T[1] - W1[1]) * 0.5 - 2];
  return `M${pt(S[0], S[1])} Q${pt(S[0] + (W1[0] - S[0]) * 0.1, W1[1] + 6)} ${pt(W1[0], W1[1])} Q${pt(W1[0] + (Tc[0] - W1[0]) * 0.5, W1[1] - 4)} ${pt(Tc[0], Tc[1])} Q${pt((Tc[0] + S[0]) / 2 - 2, (Tc[1] + S[1]) / 2 + 12)} ${pt(S[0], S[1])}Z`;
}

function zephyr(stage) {
  const p = ZEPHYR[stage];
  const c = PALETTES.zephyr;
  const body = [];
  const pattern = [];
  const eye = [];
  const { bx, by, brx, bry, hx, hy, r } = p;
  const sx = bx + 2;
  const sy = by - bry * 0.55;

  // Cánh xa (tối, lệch lên phải để tạo chiều sâu).
  const far = wingD(sx + 14, sy - 8, p.wing.map((v) => v * 0.9), p.feathers);
  body.push(el(path(far.d, { fill: c.secondary, 'data-part': 'wing' })));
  // Đuôi mây.
  const tipX = bx - brx - p.tail * 0.55;
  const tipY = by + 22;
  body.push(el(path(`M${pt(bx - brx + 10, by + 4)} Q${pt(bx - brx - p.tail * 0.2, by + 26)} ${pt(tipX, tipY - 4)} L${pt(tipX + 2, tipY + 6)} Q${pt(bx - brx - p.tail * 0.1, by + 36)} ${pt(bx - brx + 16, by + 20)}Z`, { fill: c.primary })));
  const puffs = [
    [tipX - 2, tipY - 6, 9],
    [tipX - 12, tipY + 3, 10.5],
    [tipX + 4, tipY + 6, 7.5],
  ].slice(0, p.puffs);
  for (const [x, y, rr] of puffs) body.push(el(circle(x, y, rr * (stage === 'baby' ? 0.85 : 1), { fill: c.belly, 'data-part': 'cloud-tail' })));
  // Chân xa (chân đậu) — nét hai lớp.
  const leg = (lx, color) => {
    const d = `M${pt(lx, by + 18)} L${pt(lx + 3, GROUND - 4)} M${pt(lx + 3, GROUND - 4)} L${pt(lx + 13, GROUND - 1)} M${pt(lx + 3, GROUND - 4)} L${pt(lx + 9, GROUND + 1)} M${pt(lx + 3, GROUND - 4)} L${pt(lx - 6, GROUND - 1)}`;
    body.push(el(path(d, { fill: 'none', 'stroke-width': 7.5 }), false));
    body.push(el(path(d, { fill: 'none', stroke: color, 'stroke-width': 4, 'data-part': 'perching-foot' }), false));
  };
  leg(bx - 12, '#D9BE78');
  // Thân đứng nghiêng, ngực lông.
  body.push(el(ellipse(bx, by, brx, bry, { fill: c.primary, transform: `rotate(-14 ${r1(bx)} ${r1(by)})` })));
  body.push(el(ellipse(bx + 12, by + 6, brx * 0.52, bry * 0.66, { fill: c.belly, stroke: 'none', transform: `rotate(-14 ${r1(bx)} ${r1(by)})` })));
  // Đùi lông + chân gần.
  leg(bx + 6, c.accent);
  body.push(el(ellipse(bx + 4, by + 16, 12, 13, { fill: c.primary })));
  // Cổ (elip nghiêng nối thân và đầu).
  const nx = (bx + brx * 0.35 + hx) / 2;
  const ny = (by - bry * 0.55 + hy + r * 0.6) / 2;
  body.push(el(ellipse(nx, ny, r * 0.55, Math.max(14, (by - hy) * 0.42), { fill: c.primary, transform: `rotate(32 ${r1(nx)} ${r1(ny)})` })));
  // Cổ lông xù (scallop) ở gốc cổ — vẽ trước đầu để đầu che nửa trên.
  for (let i = 0; i < 5; i++) {
    const a = rad(200 - i * 30);
    body.push(el(circle(hx - r * 0.3 + Math.cos(a) * r * 0.78, hy + r * 1.02 - Math.sin(a) * r * 0.3, r * 0.27, { fill: c.belly })));
  }
  // Chỏm lông tai vuốt ra sau.
  const tuftSet = { 1: [[-150, 16, 5]], 2: [[-162, 22, 4.6], [-137, 17, 4]], 3: [[-170, 28, 4.6], [-150, 24, 4.4], [-128, 17, 3.8]] }[p.tufts];
  for (const [deg, len, w] of tuftSet) {
    body.push(el(path(leafD(hx - r * 0.45, hy - r * 0.6, deg, len, w), { fill: c.belly })));
  }
  // Đầu + mõm ngắn.
  body.push(el(circle(hx, hy, r, { fill: c.primary })));
  body.push(el(ellipse(hx + r * 0.72, hy + r * 0.32, r * 0.5, r * 0.36, { fill: c.belly })));
  body.push(el(circle(hx + r * 1.1, hy + r * 0.18, 1.7, { fill: c.secondary, stroke: 'none' }), false));
  body.push(el(path(`M${pt(hx + r * 0.6, hy + r * 0.52)} Q${pt(hx + r * 0.85, hy + r * 0.66)} ${pt(hx + r * 1.08, hy + r * 0.46)}`, { fill: 'none', 'stroke-width': 1.8 }), false));
  // Cánh gần (trên thân) với dải lông phủ màu nhấn và cuống lông bay.
  const near = wingD(sx, sy, p.wing, p.feathers);
  body.push(el(path(near.d, { fill: c.primary, 'data-part': 'wing' })));
  body.push(el(path(covertD(sx, sy, p.wing), { fill: c.accent, 'stroke-width': 1.8 })));
  for (const [x, y] of near.joints) {
    const qx = x + (near.W1[0] - x) * 0.32;
    const qy = y + (near.W1[1] - y) * 0.32;
    body.push(el(path(`M${pt(x, y)} L${pt(qx, qy)}`, { fill: 'none', 'stroke-width': 1.5 }), false));
  }

  // Pattern: vạch chữ V trên lông phủ cánh.
  for (let i = 0; i < p.chevrons; i++) {
    const x = sx + p.wing[0] * 0.55 - i * 9;
    const y = sy + p.wing[1] * 0.45 + 6 + i * 2;
    pattern.push(path(`M${pt(x - 4, y - 4)} L${pt(x, y)} L${pt(x + 4, y - 4)}`, { fill: 'none', stroke: c.secondary, 'stroke-width': 2, opacity: 0.6 }));
  }

  const ex = hx + r * 0.25;
  const ey = hy - r * 0.12;
  eye.push(ellipse(ex, ey, p.eye[0], p.eye[1], { fill: INK }));
  eye.push(circle(ex + 2.2, ey - 3, 2.4, { fill: '#FFFFFF' }));
  eye.push(circle(ex - 1.8, ey + 3.2, 1, { fill: '#FFFFFF' }));

  return {
    outline: c.secondary,
    body,
    pattern,
    eye,
    fx: {
      halo: [hx + 2, hy - r - 12, r * 0.85],
      facets: [[bx + 2, by + 4], [bx - 12, by - 6], [sx + p.wing[2] * 0.5, sy + p.wing[3] * 0.45], [tipX - 8, tipY]],
      sparkles: [[hx + r + 16, hy - 6], [sx + p.wing[2] - 10, sy + p.wing[3] - 8]],
      streak: `M${pt(sx - 4, sy - 4)} Q${pt(sx + p.wing[0], sy + p.wing[1] * 0.6)} ${pt(sx + p.wing[2] * 0.7, sy + p.wing[3] * 0.9)}`,
    },
  };
}

// ------------------------------------------------------- Aether overlays
const AETHER = {
  crystal: { tint: '#CFF6FF', opacity: 0.46, light: '#F2FFFF', ink: '#4F93AE' },
  golden: { tint: '#F4C14F', opacity: 0.6, light: '#FFF4B8', ink: '#9A6B22' },
  prismatic: { tint: null, opacity: 0.62, light: '#FFFFFF', ink: '#7365A4' },
};
const BADGES = {
  crystal: '<g data-variant-badge="crystal" aria-hidden="true"><circle cx="26" cy="26" r="20" fill="#FFFFFF" stroke="#2B2B3A" stroke-width="3"/><path d="M26 12 L37 26 L26 40 L15 26Z" fill="#2B2B3A"/></g>',
  golden: '<g data-variant-badge="golden" aria-hidden="true"><circle cx="26" cy="26" r="20" fill="#FFFFFF" stroke="#2B2B3A" stroke-width="3"/><circle cx="26" cy="26" r="10" fill="none" stroke="#2B2B3A" stroke-width="5"/></g>',
  prismatic: '<g data-variant-badge="prismatic" aria-hidden="true"><circle cx="26" cy="26" r="20" fill="#FFFFFF" stroke="#2B2B3A" stroke-width="3"/><path d="M26 10 L30.2 20.2 L41.2 21 L32.8 28.1 L35.4 38.8 L26 33 L16.6 38.8 L19.2 28.1 L10.8 21 L21.8 20.2Z" fill="#2B2B3A"/></g>',
};
const star5 = (x, y, R) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = rad(-90 + i * 36);
    const rr = i % 2 === 0 ? R : R * 0.45;
    d += `${i === 0 ? 'M' : 'L'}${pt(x + Math.cos(a) * rr, y + Math.sin(a) * rr)} `;
  }
  return `${d.trim()}Z`;
};
const glint4 = (x, y, R) => `M${pt(x, y - R)} L${pt(x + R * 0.3, y - R * 0.3)} L${pt(x + R, y)} L${pt(x + R * 0.3, y + R * 0.3)} L${pt(x, y + R)} L${pt(x - R * 0.3, y + R * 0.3)} L${pt(x - R, y)} L${pt(x - R * 0.3, y - R * 0.3)}Z`;

function aetherFx(mutation, fx, idp) {
  const a = AETHER[mutation];
  const out = [];
  if (mutation === 'crystal') {
    for (const [x, y] of fx.facets) out.push(path(`M${pt(x, y - 7)} l5.5 7 -5.5 7 -5.5 -7Z`, { fill: a.light, stroke: a.ink, 'stroke-width': 1.2 }));
    out.push(path(fx.streak, { fill: 'none', stroke: a.light, 'stroke-width': 3, 'stroke-linecap': 'round', 'clip-path': `url(#${idp}-sil)` }));
    for (const [x, y] of fx.sparkles) out.push(path(glint4(x, y, 8), { fill: a.light, stroke: a.ink, 'stroke-width': 1.2 }));
  } else if (mutation === 'golden') {
    const [hx, hy, hr] = fx.halo;
    out.push(ellipse(hx, hy, hr, 6.5, { fill: 'none', stroke: a.ink, 'stroke-width': 6.5 }));
    out.push(ellipse(hx, hy, hr, 6.5, { fill: 'none', stroke: a.light, 'stroke-width': 3.6 }));
    out.push(path(fx.streak, { fill: 'none', stroke: a.light, 'stroke-width': 3, 'stroke-linecap': 'round', 'clip-path': `url(#${idp}-sil)` }));
    for (const [x, y] of fx.sparkles) out.push(circle(x, y, 5.5, { fill: 'none', stroke: a.ink, 'stroke-width': 3.4 }));
  } else if (mutation === 'prismatic') {
    out.push(path(fx.streak, { fill: 'none', stroke: `url(#${idp}-rainbow)`, 'stroke-width': 4, 'stroke-linecap': 'round', 'clip-path': `url(#${idp}-sil)` }));
    out.push(path(fx.streak, { fill: 'none', stroke: a.light, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'clip-path': `url(#${idp}-sil)`, transform: 'translate(0 5)' }));
    for (const [x, y] of fx.sparkles) out.push(path(star5(x, y, 9), { fill: a.light, stroke: a.ink, 'stroke-width': 1.3 }));
  }
  return out;
}

// ------------------------------------------------------------- assemble
const BUILDERS = { droplet, sprout, zephyr };

function svgFor(speciesId, stage, mutation) {
  const s = STAGE_SCALE[stage];
  const tf = `translate(${r1(ANCHOR.x * (1 - s))} ${r1(ANCHOR.y * (1 - s))}) scale(${s})`;
  const art = BUILDERS[speciesId](stage);
  const idp = `dv-${speciesId}-${stage}-${mutation}`;
  const stroke = `stroke="${art.outline}" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round"`;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-species="${speciesId}" data-stage="${stage}" data-mutation="${mutation}" data-asset-status="prototype">`);
  if (mutation !== 'normal') {
    const sil = art.body.filter((e) => e.clip).map((e) => e.markup).join('');
    let defs = `<clipPath id="${idp}-sil">${sil}</clipPath>`;
    if (mutation === 'prismatic') {
      defs += `<linearGradient id="${idp}-rainbow" gradientUnits="userSpaceOnUse" x1="30" y1="40" x2="210" y2="170"><stop stop-color="#E9A8AB"/><stop offset=".32" stop-color="#F0D486"/><stop offset=".6" stop-color="#82CDB7"/><stop offset="1" stop-color="#9B8DDD"/></linearGradient>`;
    }
    parts.push(`<defs>${defs}</defs>`);
  }
  parts.push(`<g data-layer="shadow">${ellipse(ANCHOR.x, 175, 62 * s, 9 * s, { fill: '#293F45', opacity: 0.13 })}</g>`);
  parts.push(`<g data-layer="body" transform="${tf}" ${stroke}>${art.body.map((e) => e.markup).join('')}</g>`);
  parts.push(`<g data-layer="pattern" transform="${tf}">${art.pattern.join('')}</g>`);
  if (mutation !== 'normal') {
    const a = AETHER[mutation];
    const fill = a.tint ?? `url(#${idp}-rainbow)`;
    parts.push(`<g data-layer="aether-tint" data-aether="${mutation}" transform="${tf}"><rect x="-40" y="-40" width="320" height="280" fill="${fill}" opacity="${a.opacity}" clip-path="url(#${idp}-sil)"/></g>`);
  }
  parts.push(`<g data-layer="eye" transform="${tf}">${art.eye.join('')}</g>`);
  if (mutation !== 'normal') {
    parts.push(`<g data-layer="aether-fx" data-aether="${mutation}" transform="${tf}" stroke-linejoin="round">${aetherFx(mutation, art.fx, idp).join('')}</g>`);
    parts.push(BADGES[mutation]);
  }
  parts.push('</svg>');
  return parts.join('');
}

let count = 0;
for (const speciesId of Object.keys(BUILDERS)) {
  for (const stage of STAGES) {
    for (const mutation of MUTATIONS) {
      const file = join(OUT, speciesId, `${stage}_${mutation}.svg`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${svgFor(speciesId, stage, mutation)}\n`);
      count++;
    }
  }
}
console.log(`Generated ${count} SVG sprites in ${OUT}`);
