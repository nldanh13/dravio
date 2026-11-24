import { HABITAT_PROFILES, getBiology, type HabitatId } from '../../data/g0Biology';
import type { G0HabitatEnv, QualityKey } from '../../types/biology';

/**
 * Suitability thuần (GDD 3.1 trang 5; PACK_README G0): hard gates rồi
 * `clamp(100 − Σ ceil(max(0, comfortMin − actual)), 0, 100)` trên các chỉ số liên quan.
 * ≥ 80 phù hợp, 50–79 cho bố trí kèm cảnh báo, < 50 không cho bố trí lâu dài.
 * Chuyển từ `src/data/g0Biology.ts` theo AI_HANDOFF; dữ liệu vẫn chỉ có một nguồn.
 */

export const SUITABILITY_ALLOWED = 50;
export const SUITABILITY_GOOD = 80;

export type HabitatResult = { allowed: boolean; score: number; reason: 'ok' | 'incompatible' | 'invalid-env' | 'low-suitability' };
const keys: readonly QualityKey[] = ['airQuality', 'waterQuality', 'vegetation', 'foodAvailability'];
export function suitability(id: string, habitatId: HabitatId, env: G0HabitatEnv): HabitatResult {
  const b = getBiology(id);
  if (!Object.prototype.hasOwnProperty.call(HABITAT_PROFILES, habitatId) || keys.some(k => !Number.isFinite(env[k]) || env[k] < 0 || env[k] > 100)) {
    return { allowed: false, score: 0, reason: 'invalid-env' };
  }
  const h = HABITAT_PROFILES[habitatId];
  // A microhabitat is an approved physical configuration, not an extra zone capacity.
  const compatible = b.habitatRules.includes(habitatId) && env.zoneId === h.zoneId && env.realm === h.realm &&
    b.thermalBands.includes(env.temperatureBand) && env.humidityBand === h.humidityBand &&
    env.salinityBand === h.salinityBand && b.salinityBands.includes(env.salinityBand) &&
    env.depthBand === h.depthBand && b.depthBands.includes(env.depthBand) &&
    env.altitudeBand === h.altitudeBand && b.altitudeBands.includes(env.altitudeBand) &&
    (env.realm === 'ocean' ? b.respiration !== 'lung' && b.locomotion.includes('swim') : b.respiration !== 'gill' && b.locomotion.includes('walk')) &&
    (env.realm !== 'sky' || (b.locomotion.includes('fly') && env.perch));
  if (!compatible) return { allowed: false, score: 0, reason: 'incompatible' };
  // Ignore non-relevant environmental metrics; deficits cost 1 point each.
  const relevant: readonly QualityKey[] = env.realm === 'ocean' ? ['waterQuality', 'vegetation', 'foodAvailability'] :
    habitatId === 'origin_pondbank' && b.locomotion.includes('swim') ? keys : ['airQuality', 'vegetation', 'foodAvailability'];
  const score = Math.max(0, Math.min(100, 100 - relevant.reduce((n, k) => n + Math.ceil(Math.max(0, b.comfortMin[k] - env[k])), 0)));
  return { allowed: score >= SUITABILITY_ALLOWED, score, reason: score >= SUITABILITY_ALLOWED ? 'ok' : 'low-suitability' };
}

export type SuitabilityTier = 'good' | 'needs-improvement' | 'unsuitable';

export function suitabilityTier(r: HabitatResult): SuitabilityTier {
  if (!r.allowed) return 'unsuitable';
  return r.score >= SUITABILITY_GOOD ? 'good' : 'needs-improvement';
}

/** Suitability của loài tại một microhabitat theo hồ sơ môi trường hiện tại. */
export function speciesSuitability(speciesId: string, habitatId: HabitatId): HabitatResult {
  return suitability(speciesId, habitatId, HABITAT_PROFILES[habitatId]);
}
