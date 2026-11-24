#!/usr/bin/env node
/**
 * Dravio — icon thức ăn 4 nhóm diet (fruit, leaf, aquatic, aether). Dùng chung cho vật phẩm
 * thức ăn trong cảnh (renderer) và bảng chọn thức ăn (UI). 48×48, viền bo tròn như rồng,
 * hình dạng khác nhau để không phụ thuộc màu. Chạy: `node scripts/art/generate-food-icons.mjs`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'assets', 'icons', 'food');
const svg = (id, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" data-icon="food.${id}" data-asset-status="prototype" stroke-linejoin="round" stroke-linecap="round">${body}</svg>\n`;
const shadow = '<ellipse cx="24" cy="43" rx="13" ry="3" fill="#293F45" opacity=".16"/>';

const ICONS = {
  // Quả mọng tròn (trái cây): hai quả + lá.
  fruit: `${shadow}<circle cx="19" cy="29" r="11" fill="#E56F5A" stroke="#93392E" stroke-width="2.6"/><circle cx="31" cy="31" r="9" fill="#F08A6C" stroke="#93392E" stroke-width="2.6"/><circle cx="15.5" cy="25" r="2.6" fill="#FFFFFF" opacity=".85"/><path d="M22 18 Q24 11 30 9" fill="none" stroke="#6F4E37" stroke-width="2.4"/><path d="M27 12 Q35 8 38 14 Q31 17 27 12Z" fill="#8CC48A" stroke="#4F7F48" stroke-width="2"/>`,
  // Lá xanh (rau lá): hình giọt nhọn có gân.
  leaf: `${shadow}<path d="M10 38 Q8 16 36 8 Q42 30 18 40Z" fill="#8CC48A" stroke="#4F7F48" stroke-width="2.6"/><path d="M12 37 Q22 26 33 12 M18 30 L14 24 M24 23 L22 16 M22 26 L30 26" fill="none" stroke="#4F7F48" stroke-width="2"/>`,
  // Cá nhỏ (thủy sinh): thân hình thoi + đuôi.
  aquatic: `${shadow}<path d="M8 26 Q20 12 34 24 Q20 36 8 26Z" fill="#7CC7D9" stroke="#2F7491" stroke-width="2.6"/><path d="M33 24 L42 16 L41 32Z" fill="#9AD8E5" stroke="#2F7491" stroke-width="2.6"/><circle cx="15" cy="24" r="2.2" fill="#2B2B3A"/><path d="M20 30 Q24 28 27 30" fill="none" stroke="#FFFFFF" stroke-width="2"/>`,
  // Tinh thể Aether: viên ngọc sáu cạnh phát sáng.
  aether: `${shadow}<circle cx="24" cy="24" r="17" fill="#C9B8F2" opacity=".35"/><path d="M24 7 L35 17 L31 36 L17 36 L13 17Z" fill="#B39DEB" stroke="#5F4A9E" stroke-width="2.6"/><path d="M24 7 L24 36 M13 17 L35 17 M24 17 L17 36 M24 17 L31 36" fill="none" stroke="#5F4A9E" stroke-width="1.4" opacity=".7"/><path d="M19 12 L21 10" stroke="#FFFFFF" stroke-width="2.4"/>`,
};

mkdirSync(OUT, { recursive: true });
for (const [id, body] of Object.entries(ICONS)) writeFileSync(join(OUT, `${id}.svg`), svg(id, body));
console.log(`Generated ${Object.keys(ICONS).length} food icons in ${OUT}`);
