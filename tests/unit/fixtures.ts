import { getSpecies } from '../../src/data/dragons';
import type { DragonInstance } from '../../src/types/game';

export function adult(uid: string, speciesId: string, extra: Partial<DragonInstance> = {}): DragonInstance {
  return {
    uid,
    speciesId,
    genotype: { pigment: ['R', 'r'], pattern: ['P', 'p'], eye: ['B', 'b'] },
    mutation: 'normal',
    xpSec: getSpecies(speciesId).growthTimeSec,
    locked: false,
    location: { kind: 'storage' },
    hatchedAtMs: 0,
    personality: 'calm',
    bond: 0,
    parentIds: null,
    generation: 1,
    ancestry: 'unknown',
    origin: 'pack',
    activity: 'idle',
    breedCooldownUntilMs: 0,
    ...extra,
  };
}
