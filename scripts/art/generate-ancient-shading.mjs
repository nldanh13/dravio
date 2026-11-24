import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../src/assets/animations/', import.meta.url));
export const SHADED_SPECIES = ['emberling', 'sprout'];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');

/** Soft volume on existing geometry. This is a derived prototype, not a new painted character. */
export function shadeFrame(svg) {
  if (!svg.startsWith('<svg ') || !svg.includes('viewBox="0 0 240 200"')) throw new Error('Expected a canonical dragon frame');
  if (svg.includes('data-art-treatment="ancient-shaded"')) throw new Error('Already shaded');
  const gradients = new Map();
  // Keep path geometry, strokes, eye catchlights, existing Aether gradients and attachments.
  // Equal source colours always receive equal treatment, independently of the mutation.
  const painted = svg.replace(/fill="(#[0-9a-fA-F]{6})"/g, (whole, hex) => {
    const color = hex.toLowerCase();
    const v = rgb(color);
    const max = Math.max(...v), min = Math.min(...v);
    if (max < 83 || min > 232 || max - min < 14) return whole;
    const id = 'dravio_shade_' + color.slice(1);
    if (!gradients.has(id)) {
      const light = mix(v, [255, 246, 194], 0.42);
      const mid = mix(v, [255, 224, 153], 0.10);
      const dark = mix(v, [38, 62, 56], 0.35);
      gradients.set(id, `<radialGradient id="${id}" cx="30%" cy="20%" r="82%" fx="24%" fy="15%"><stop stop-color="${light}"/><stop offset=".48" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`);
    }
    return `fill="url(#${id})"`;
  });
  const at = painted.indexOf('>');
  return painted.slice(0, at) + ' data-art-treatment="ancient-shaded">' +
    '<defs>' + [...gradients.values()].join('') + '</defs>' + painted.slice(at + 1);
}

export function generateShadedFrames() {
  let count = 0;
  for (const species of SHADED_SPECIES) {
    const dir = join(root, 'frames', species);
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.svg')).sort()) {
      const dest = join(root, 'shaded', species, name);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, shadeFrame(readFileSync(join(dir, name), 'utf8')), 'utf8');
      count++;
    }
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Ancient shaded prototype frames: ' + generateShadedFrames());
}
