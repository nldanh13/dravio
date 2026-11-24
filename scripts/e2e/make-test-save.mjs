#!/usr/bin/env node
/**
 * Tạo file save kiểm thử hợp lệ (Dravio Save Schema hiện tại, checksum đúng) bằng chính engine,
 * để kiểm thử renderer trên trình duyệt với đủ 4 loài Common (đi, bơi, bay) và 3 sinh cảnh mở.
 * Chỉ dùng cho kiểm thử; không phải dữ liệu production.
 * Chạy: `node scripts/e2e/make-test-save.mjs <out.json>`
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] ?? join(ROOT, 'dravio-test-save.json');
const vite = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const { createInitialState } = await vite.ssrLoadModule('/src/engine/core/initialState.ts');
const { createRng } = await vite.ssrLoadModule('/src/engine/core/rng.ts');
const { validateGameState } = await vite.ssrLoadModule('/src/engine/core/validation.ts');
const { serializeSave } = await vite.ssrLoadModule('/src/persistence/schema.ts');
const { getSpecies } = await vite.ssrLoadModule('/src/data/dragons.ts');
const { founderGenotype } = await vite.ssrLoadModule('/src/engine/genetics/alleles.ts');

const now = Date.now();
const s = createInitialState({ saveId: 'e2e-renderer', nowMs: now, rng: createRng(42) });
const at = (habitatId) => ({ kind: 'zone', zoneId: 'origin', habitatId });
const mk = (uid, speciesId, stage, mutation, habitatId, personality) => {
  const sp = getSpecies(speciesId);
  const xp = stage === 'adult' ? sp.growthTimeSec : stage === 'juvenile' ? Math.ceil(sp.growthTimeSec * 0.5) : 0;
  return {
    uid,
    speciesId,
    genotype: founderGenotype(uid, s.contentVersion, sp.loci),
    mutation,
    xpSec: xp,
    locked: false,
    location: at(habitatId),
    hatchedAtMs: now - 60_000,
    personality,
    bond: 0,
    parentIds: null,
    generation: 1,
    ancestry: 'unknown',
    origin: 'pack',
    activity: 'idle',
    breedCooldownUntilMs: 0,
  };
};
const founder = s.dragons[0];
const state = {
  ...s,
  discoveries: ['DISC_AQUATIC_HABITAT', 'DISC_EMBERLING_THERMAL'],
  zones: s.zones.map((z) => (z.id === 'origin' ? { ...z, unlockedHabitatIds: ['origin_meadow', 'origin_warm_rocks', 'origin_pondbank'] } : z)),
  dragons: [
    founder,
    mk('e2e-zephyr-adult', 'zephyr', 'adult', 'normal', 'origin_meadow', 'playful'),
    mk('e2e-zephyr-baby', 'zephyr', 'baby', 'crystal', 'origin_meadow', 'playful'),
    mk('e2e-droplet-adult', 'droplet', 'adult', 'golden', 'origin_pondbank', 'playful'),
    mk('e2e-sprout-juv', 'sprout', 'juvenile', 'prismatic', 'origin_pondbank', 'curious'),
  ],
};
const v = validateGameState(state);
if (!v.ok) {
  console.error(v.errors);
  process.exit(1);
}
writeFileSync(out, await serializeSave(state, now));
await vite.close();
console.log(`Wrote ${out} (${state.dragons.length} dragons)`);
