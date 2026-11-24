#!/usr/bin/env node
/**
 * Dravio — hiệu ứng hoạt ảnh rồng (PR2). Chạy: `node scripts/art/generate-effects.mjs`.
 * Đầu ra: `src/assets/effects/dragon/<effectId>.svg`.
 * SVG tự chứa, không chữ (không phụ thuộc font), không script/tham chiếu ngoài.
 * Kích thước, điểm neo, chuyển động và cờ informational nằm trong
 * `src/assets/effects/manifest.ts` (test kiểm tra viewBox khớp).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'assets', 'effects', 'dragon');

const svg = (id, w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-effect="${id}" data-asset-status="prototype" stroke-linejoin="round" stroke-linecap="round">${body}</svg>\n`;

const heart = (x, y, s, fill, stroke) =>
  `<path d="M${x} ${y + 8 * s} C${x - 14 * s} ${y - 2 * s} ${x - 8 * s} ${y - 14 * s} ${x} ${y - 6 * s} C${x + 8 * s} ${y - 14 * s} ${x + 14 * s} ${y - 2 * s} ${x} ${y + 8 * s}Z" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>`;
const zGlyph = (x, y, s) =>
  `<path d="M${x} ${y} h${10 * s} l${-10 * s} ${10 * s} h${10 * s}" fill="none" stroke="#4E5A96" stroke-width="${5 * s}"/><path d="M${x} ${y} h${10 * s} l${-10 * s} ${10 * s} h${10 * s}" fill="none" stroke="#C9D2F5" stroke-width="${2.4 * s}"/>`;
const star = (x, y, R, fill, stroke) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 === 0 ? R : R * 0.45;
    d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)} `;
  }
  return `<path d="${d.trim()}Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
};
const glint = (x, y, R, fill, stroke) =>
  `<path d="M${x} ${y - R} Q${x + R * 0.15} ${y - R * 0.15} ${x + R} ${y} Q${x + R * 0.15} ${y + R * 0.15} ${x} ${y + R} Q${x - R * 0.15} ${y + R * 0.15} ${x - R} ${y} Q${x - R * 0.15} ${y - R * 0.15} ${x} ${y - R}Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;

const EFFECTS = {
  // Bóng đất: renderer co giãn theo độ cao khi bay (bóng không nằm trong khung hoạt ảnh).
  shadow: svg('shadow', 128, 24, '<ellipse cx="64" cy="12" rx="62" ry="9" fill="#293F45" opacity=".13"/>'),
  zzz: svg('zzz', 64, 64, `${zGlyph(8, 40, 1)}${zGlyph(26, 24, 0.8)}${zGlyph(42, 8, 0.6)}`),
  heart: svg('heart', 48, 48, `${heart(24, 24, 1.3, '#F28CA0', '#B0506A')}<path d="M16 16 q3 -3 6 -1" fill="none" stroke="#FFFFFF" stroke-width="2.4"/>`),
  happy_burst: svg(
    'happy_burst',
    64,
    64,
    `${star(32, 14, 9, '#FFE59A', '#C99A3B')}${star(12, 32, 6, '#F6B4C8', '#B0506A')}${star(52, 30, 6, '#B9E3C6', '#4F8A63')}${glint(20, 12, 4, '#FFFFFF', '#C99A3B')}${glint(46, 50, 4, '#FFFFFF', '#C99A3B')}`,
  ),
  crumbs: svg(
    'crumbs',
    48,
    32,
    '<circle cx="12" cy="20" r="4" fill="#E7B864" stroke="#9A6B22" stroke-width="1.6"/><circle cx="24" cy="26" r="3" fill="#C9674F" stroke="#86392E" stroke-width="1.4"/><circle cx="34" cy="18" r="3.4" fill="#A9D08E" stroke="#397C58" stroke-width="1.4"/><circle cx="20" cy="12" r="2.2" fill="#E7B864" stroke="#9A6B22" stroke-width="1.2"/>',
  ),
  dust: svg(
    'dust',
    64,
    32,
    '<circle cx="18" cy="22" r="8" fill="#EFE6D2" stroke="#B8A988" stroke-width="2"/><circle cx="32" cy="18" r="10" fill="#F5EEDD" stroke="#B8A988" stroke-width="2"/><circle cx="47" cy="23" r="7" fill="#EFE6D2" stroke="#B8A988" stroke-width="2"/>',
  ),
  ripple: svg(
    'ripple',
    128,
    32,
    '<ellipse cx="64" cy="16" rx="58" ry="10" fill="none" stroke="#7FC4D8" stroke-width="2.4" opacity=".75"/><ellipse cx="64" cy="16" rx="38" ry="6" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".85"/>',
  ),
  // Mặt nước bán trong suốt: renderer đặt trên khung bơi, mép trên = waterline.
  water_surface: svg(
    'water_surface',
    256,
    64,
    '<path d="M0 8 Q16 2 32 8 T64 8 T96 8 T128 8 T160 8 T192 8 T224 8 T256 8 V64 H0Z" fill="#6FC3D6" opacity=".55"/><path d="M0 8 Q16 2 32 8 T64 8 T96 8 T128 8 T160 8 T192 8 T224 8 T256 8" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".9"/>',
  ),
  bubbles: svg(
    'bubbles',
    32,
    48,
    '<circle cx="12" cy="38" r="6" fill="#DFF6FB" stroke="#5FA9C2" stroke-width="1.8"/><circle cx="22" cy="22" r="4.4" fill="#DFF6FB" stroke="#5FA9C2" stroke-width="1.6"/><circle cx="14" cy="9" r="3" fill="#DFF6FB" stroke="#5FA9C2" stroke-width="1.4"/><circle cx="10" cy="36" r="1.6" fill="#FFFFFF"/>',
  ),
  wind: svg(
    'wind',
    64,
    48,
    '<path d="M6 14 H38 Q48 14 48 6 Q48 0 42 2" fill="none" stroke="#6388BA" stroke-width="3"/><path d="M2 26 H52 Q62 26 60 36 Q58 42 52 40" fill="none" stroke="#A6C8E6" stroke-width="3"/><path d="M14 38 H34" fill="none" stroke="#6388BA" stroke-width="3"/>',
  ),
  // Thông tin chăm sóc (informational): giữ khi giảm chuyển động.
  bandage: svg(
    'bandage',
    48,
    32,
    '<rect x="3" y="8" width="42" height="16" rx="8" fill="#FFF6E6" stroke="#C9A77A" stroke-width="2.4" transform="rotate(-12 24 16)"/><rect x="17" y="9" width="14" height="14" rx="3" fill="#F3E2C3" stroke="#C9A77A" stroke-width="1.6" transform="rotate(-12 24 16)"/><circle cx="21" cy="14" r="1.2" fill="#C9A77A"/><circle cx="27" cy="13" r="1.2" fill="#C9A77A"/><circle cx="22" cy="19" r="1.2" fill="#C9A77A"/><circle cx="28" cy="18" r="1.2" fill="#C9A77A"/>',
  ),
  care_leaf: svg(
    'care_leaf',
    48,
    48,
    '<circle cx="24" cy="24" r="20" fill="#FFFFFF" stroke="#397C58" stroke-width="3"/><path d="M24 12 Q38 18 24 38 Q10 18 24 12Z" fill="#A9D08E" stroke="#397C58" stroke-width="2"/><path d="M24 18 V32 M18 25 H30" fill="none" stroke="#FFFFFF" stroke-width="3.2"/><path d="M24 18 V32 M18 25 H30" fill="none" stroke="#397C58" stroke-width="1.4"/>',
  ),
  recovery_glow: svg(
    'recovery_glow',
    96,
    96,
    `<circle cx="48" cy="48" r="34" fill="none" stroke="#FFE59A" stroke-width="4" opacity=".8"/><circle cx="48" cy="48" r="24" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".9"/>${glint(48, 10, 7, '#FFF4B8', '#C99A3B')}${glint(84, 50, 6, '#FFF4B8', '#C99A3B')}${glint(14, 56, 6, '#FFF4B8', '#C99A3B')}${glint(60, 86, 5, '#FFF4B8', '#C99A3B')}`,
  ),
};

mkdirSync(OUT, { recursive: true });
for (const [id, markup] of Object.entries(EFFECTS)) writeFileSync(join(OUT, `${id}.svg`), markup);
console.log(`Generated ${Object.keys(EFFECTS).length} effect SVGs in ${OUT}`);
