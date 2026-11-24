/** Dravio G0 decision pack: new data only; do not replace existing species IDs/economy. */
import type { G0Anatomy, G0HabitatEnv, QualityKey } from '../types/biology';

export type { G0Anatomy, G0HabitatEnv, G0Realm, HazardId, QualityKey, TemperatureBand } from '../types/biology';

export const HABITAT_PROFILES = {
  "origin_meadow": {
    "zoneId": "origin",
    "realm": "land",
    "temperatureBand": "mild",
    "humidityBand": "normal",
    "salinityBand": "none",
    "depthBand": "none",
    "altitudeBand": "ground",
    "perch": true,
    "airQuality": 90,
    "waterQuality": 90,
    "vegetation": 80,
    "foodAvailability": 90
  },
  "origin_pondbank": {
    "zoneId": "origin",
    "realm": "land",
    "temperatureBand": "mild",
    "humidityBand": "humid",
    "salinityBand": "fresh",
    "depthBand": "none",
    "altitudeBand": "ground",
    "perch": true,
    "airQuality": 90,
    "waterQuality": 90,
    "vegetation": 85,
    "foodAvailability": 90
  },
  "origin_warm_rocks": {
    "zoneId": "origin",
    "realm": "land",
    "temperatureBand": "warm",
    "humidityBand": "dry",
    "salinityBand": "none",
    "depthBand": "none",
    "altitudeBand": "ground",
    "perch": true,
    "airQuality": 90,
    "waterQuality": 90,
    "vegetation": 45,
    "foodAvailability": 90
  },
  "ocean_estuary": {
    "zoneId": "ocean",
    "realm": "ocean",
    "temperatureBand": "mild",
    "humidityBand": "submerged",
    "salinityBand": "brackish",
    "depthBand": "shallow",
    "altitudeBand": "ground",
    "perch": false,
    "airQuality": 90,
    "waterQuality": 95,
    "vegetation": 85,
    "foodAvailability": 90
  },
  "ocean_reef": {
    "zoneId": "ocean",
    "realm": "ocean",
    "temperatureBand": "warm",
    "humidityBand": "submerged",
    "salinityBand": "marine",
    "depthBand": "shallow",
    "altitudeBand": "ground",
    "perch": false,
    "airQuality": 90,
    "waterQuality": 95,
    "vegetation": 70,
    "foodAvailability": 90
  },
  "ocean_cool_pool": {
    "zoneId": "ocean",
    "realm": "ocean",
    "temperatureBand": "cool",
    "humidityBand": "submerged",
    "salinityBand": "marine",
    "depthBand": "shallow",
    "altitudeBand": "ground",
    "perch": false,
    "airQuality": 90,
    "waterQuality": 95,
    "vegetation": 45,
    "foodAvailability": 90
  },
  "sky_low_island": {
    "zoneId": "sky",
    "realm": "sky",
    "temperatureBand": "mild",
    "humidityBand": "normal",
    "salinityBand": "none",
    "depthBand": "none",
    "altitudeBand": "low",
    "perch": true,
    "airQuality": 95,
    "waterQuality": 90,
    "vegetation": 70,
    "foodAvailability": 90
  }
} as const satisfies Record<string, G0HabitatEnv>;

export const SPECIES_BIOLOGY = {
  "emberling": {
    "group": "T",
    "respiration": "lung",
    "locomotion": [
      "walk"
    ],
    "protection": "scale",
    "activity": "day",
    "dietIds": [
      "fruit",
      "aether"
    ],
    "thermalBands": [
      "mild",
      "warm",
      "hot"
    ],
    "habitatRules": [
      "origin_meadow",
      "origin_warm_rocks"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 65,
      "waterQuality": 0,
      "vegetation": 30,
      "foodAvailability": 65
    },
    "resiliencePct": {
      "wildfire": 75,
      "strong_current": 15,
      "thunderstorm": 20
    },
    "palette": {
      "primary": "#D86B47",
      "secondary": "#A83D36",
      "belly": "#F9D59A",
      "accent": "#FFD66C"
    },
    "silhouetteVi": "Bốn chân, đuôi lửa tròn, không cánh.",
    "draft": false
  },
  "droplet": {
    "group": "A",
    "respiration": "dual",
    "locomotion": [
      "walk",
      "swim"
    ],
    "protection": "scale",
    "activity": "both",
    "dietIds": [
      "aquatic",
      "fruit"
    ],
    "thermalBands": [
      "cool",
      "mild",
      "warm"
    ],
    "habitatRules": [
      "origin_pondbank",
      "ocean_estuary"
    ],
    "salinityBands": [
      "brackish",
      "fresh"
    ],
    "depthBands": [
      "none",
      "shallow"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 70,
      "waterQuality": 75,
      "vegetation": 30,
      "foodAvailability": 65
    },
    "resiliencePct": {
      "wildfire": 25,
      "strong_current": 65,
      "thunderstorm": 20
    },
    "palette": {
      "primary": "#61BBD0",
      "secondary": "#337FA4",
      "belly": "#C7F2EE",
      "accent": "#86E5DE"
    },
    "silhouetteVi": "Thân tròn, vây tai, đuôi dẹt, màng chân.",
    "draft": false
  },
  "sprout": {
    "group": "T",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "burrow"
    ],
    "protection": "scale",
    "activity": "day",
    "dietIds": [
      "fruit",
      "leaf"
    ],
    "thermalBands": [
      "mild",
      "warm"
    ],
    "habitatRules": [
      "origin_meadow",
      "origin_pondbank"
    ],
    "salinityBands": [
      "fresh",
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 75,
      "waterQuality": 0,
      "vegetation": 65,
      "foodAvailability": 70
    },
    "resiliencePct": {
      "wildfire": 20,
      "strong_current": 30,
      "thunderstorm": 25
    },
    "palette": {
      "primary": "#75B57D",
      "secondary": "#397C58",
      "belly": "#E3EAC0",
      "accent": "#E7B864"
    },
    "silhouetteVi": "Mầm lá, bốn chân, đuôi lá.",
    "draft": false
  },
  "zephyr": {
    "group": "V",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "fly"
    ],
    "protection": "fur",
    "activity": "day",
    "dietIds": [
      "fruit",
      "aether"
    ],
    "thermalBands": [
      "cool",
      "mild",
      "warm"
    ],
    "habitatRules": [
      "origin_meadow",
      "sky_low_island"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground",
      "low"
    ],
    "comfortMin": {
      "airQuality": 80,
      "waterQuality": 0,
      "vegetation": 20,
      "foodAvailability": 65
    },
    "resiliencePct": {
      "wildfire": 25,
      "strong_current": 15,
      "thunderstorm": 60
    },
    "palette": {
      "primary": "#A6C8E6",
      "secondary": "#6388BA",
      "belly": "#EDF4FC",
      "accent": "#F5D999"
    },
    "silhouetteVi": "Cánh lông rộng, đuôi mây, chân đậu.",
    "draft": false
  },
  "steamdrake": {
    "group": "A",
    "respiration": "dual",
    "locomotion": [
      "walk",
      "swim"
    ],
    "protection": "scale",
    "activity": "both",
    "dietIds": [
      "aquatic",
      "aether"
    ],
    "thermalBands": [
      "mild",
      "warm",
      "hot"
    ],
    "habitatRules": [
      "origin_pondbank",
      "ocean_estuary"
    ],
    "salinityBands": [
      "brackish",
      "fresh"
    ],
    "depthBands": [
      "none",
      "shallow"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 70,
      "waterQuality": 70,
      "vegetation": 15,
      "foodAvailability": 65
    },
    "resiliencePct": {
      "wildfire": 65,
      "strong_current": 65,
      "thunderstorm": 20
    },
    "palette": {
      "primary": "#92BFC0",
      "secondary": "#527E83",
      "belly": "#E5E5CB",
      "accent": "#ECAD78"
    },
    "silhouetteVi": "Thân dài, vây sống lưng, chi ngắn.",
    "draft": false
  },
  "magma": {
    "group": "T",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "burrow"
    ],
    "protection": "armor",
    "activity": "both",
    "dietIds": [
      "aether"
    ],
    "thermalBands": [
      "warm",
      "hot"
    ],
    "habitatRules": [
      "origin_warm_rocks"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 60,
      "waterQuality": 0,
      "vegetation": 0,
      "foodAvailability": 60
    },
    "resiliencePct": {
      "wildfire": 90,
      "strong_current": 10,
      "thunderstorm": 20
    },
    "palette": {
      "primary": "#9F5544",
      "secondary": "#523B48",
      "belly": "#F1A55C",
      "accent": "#FFD261"
    },
    "silhouetteVi": "Giáp đá, sừng ngắn, chân chắc.",
    "draft": false
  },
  "sparkwing": {
    "group": "V",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "fly"
    ],
    "protection": "scale",
    "activity": "day",
    "dietIds": [
      "fruit",
      "aether"
    ],
    "thermalBands": [
      "mild",
      "warm"
    ],
    "habitatRules": [
      "origin_meadow",
      "sky_low_island"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground",
      "low"
    ],
    "comfortMin": {
      "airQuality": 75,
      "waterQuality": 0,
      "vegetation": 15,
      "foodAvailability": 65
    },
    "resiliencePct": {
      "wildfire": 45,
      "strong_current": 15,
      "thunderstorm": 85
    },
    "palette": {
      "primary": "#DBB65A",
      "secondary": "#96703B",
      "belly": "#F8EAC6",
      "accent": "#F7F08A"
    },
    "silhouetteVi": "Cánh góc cạnh, đuôi tia điện.",
    "draft": false
  },
  "frostfin": {
    "group": "A",
    "respiration": "gill",
    "locomotion": [
      "swim"
    ],
    "protection": "scale",
    "activity": "both",
    "dietIds": [
      "aquatic"
    ],
    "thermalBands": [
      "cold",
      "cool"
    ],
    "habitatRules": [
      "ocean_cool_pool"
    ],
    "salinityBands": [
      "marine"
    ],
    "depthBands": [
      "shallow"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 0,
      "waterQuality": 85,
      "vegetation": 0,
      "foodAvailability": 75
    },
    "resiliencePct": {
      "wildfire": 10,
      "strong_current": 80,
      "thunderstorm": 10
    },
    "palette": {
      "primary": "#8ABADD",
      "secondary": "#4B75AB",
      "belly": "#E0F5FF",
      "accent": "#BDEDF4"
    },
    "silhouetteVi": "Vây ngực lớn như cánh; không chân đi, không bay.",
    "draft": false
  },
  "mossback": {
    "group": "A",
    "respiration": "dual",
    "locomotion": [
      "walk",
      "swim"
    ],
    "protection": "armor",
    "activity": "day",
    "dietIds": [
      "leaf",
      "aquatic"
    ],
    "thermalBands": [
      "cool",
      "mild",
      "warm"
    ],
    "habitatRules": [
      "origin_pondbank",
      "ocean_estuary"
    ],
    "salinityBands": [
      "brackish",
      "fresh"
    ],
    "depthBands": [
      "none",
      "shallow"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 70,
      "waterQuality": 75,
      "vegetation": 60,
      "foodAvailability": 70
    },
    "resiliencePct": {
      "wildfire": 25,
      "strong_current": 80,
      "thunderstorm": 25
    },
    "palette": {
      "primary": "#829D66",
      "secondary": "#506C4C",
      "belly": "#D6D7A2",
      "accent": "#A7CD84"
    },
    "silhouetteVi": "Mai rêu, chi bè, vây đuôi.",
    "draft": false
  },
  "blossom": {
    "group": "V",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "fly"
    ],
    "protection": "scale",
    "activity": "day",
    "dietIds": [
      "fruit",
      "leaf"
    ],
    "thermalBands": [
      "mild",
      "warm"
    ],
    "habitatRules": [
      "origin_meadow",
      "sky_low_island"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground",
      "low"
    ],
    "comfortMin": {
      "airQuality": 80,
      "waterQuality": 0,
      "vegetation": 60,
      "foodAvailability": 70
    },
    "resiliencePct": {
      "wildfire": 15,
      "strong_current": 20,
      "thunderstorm": 55
    },
    "palette": {
      "primary": "#DC9FB8",
      "secondary": "#A86B94",
      "belly": "#F9E1D5",
      "accent": "#B7D99A"
    },
    "silhouetteVi": "Cánh cánh hoa, đuôi dài, chân đậu.",
    "draft": false
  },
  "solaris": {
    "group": "V",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "fly"
    ],
    "protection": "fur",
    "activity": "day",
    "dietIds": [
      "aether",
      "fruit"
    ],
    "thermalBands": [
      "mild",
      "warm",
      "hot"
    ],
    "habitatRules": [
      "origin_meadow",
      "origin_warm_rocks",
      "sky_low_island"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground",
      "low"
    ],
    "comfortMin": {
      "airQuality": 75,
      "waterQuality": 0,
      "vegetation": 10,
      "foodAvailability": 65
    },
    "resiliencePct": {
      "wildfire": 85,
      "strong_current": 10,
      "thunderstorm": 65
    },
    "palette": {
      "primary": "#ED874B",
      "secondary": "#AC4B3D",
      "belly": "#FBE1A0",
      "accent": "#FFE47F"
    },
    "silhouetteVi": "Mào lửa, cánh lông lớn, đuôi quạt.",
    "draft": false
  },
  "leviathan": {
    "group": "A",
    "respiration": "gill",
    "locomotion": [
      "swim"
    ],
    "protection": "scale",
    "activity": "both",
    "dietIds": [
      "aquatic"
    ],
    "thermalBands": [
      "mild",
      "warm"
    ],
    "habitatRules": [
      "ocean_reef"
    ],
    "salinityBands": [
      "marine"
    ],
    "depthBands": [
      "shallow"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 0,
      "waterQuality": 85,
      "vegetation": 0,
      "foodAvailability": 75
    },
    "resiliencePct": {
      "wildfire": 15,
      "strong_current": 90,
      "thunderstorm": 15
    },
    "palette": {
      "primary": "#427C9A",
      "secondary": "#27526E",
      "belly": "#C7E4D7",
      "accent": "#E38F86"
    },
    "silhouetteVi": "Thân biển dài, vây san hô, không chi đất.",
    "draft": false
  },
  "amberhorn": {
    "group": "T",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "burrow"
    ],
    "protection": "armor",
    "activity": "day",
    "dietIds": [
      "fruit",
      "aether"
    ],
    "thermalBands": [
      "mild",
      "warm",
      "hot"
    ],
    "habitatRules": [
      "origin_meadow",
      "origin_warm_rocks"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 65,
      "waterQuality": 0,
      "vegetation": 25,
      "foodAvailability": 65
    },
    "resiliencePct": {
      "wildfire": 80,
      "strong_current": 25,
      "thunderstorm": 25
    },
    "palette": {
      "primary": "#C58C45",
      "secondary": "#855B39",
      "belly": "#F3DCA4",
      "accent": "#FFE08A"
    },
    "silhouetteVi": "Sừng hổ phách, giáp lưng, bốn chân.",
    "draft": false
  },
  "aurorawing": {
    "group": "V",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "fly"
    ],
    "protection": "fur",
    "activity": "night",
    "dietIds": [
      "aether",
      "fruit"
    ],
    "thermalBands": [
      "cool",
      "mild"
    ],
    "habitatRules": [
      "origin_meadow",
      "sky_low_island"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground",
      "low"
    ],
    "comfortMin": {
      "airQuality": 85,
      "waterQuality": 0,
      "vegetation": 25,
      "foodAvailability": 65
    },
    "resiliencePct": {
      "wildfire": 25,
      "strong_current": 20,
      "thunderstorm": 80
    },
    "palette": {
      "primary": "#879BD5",
      "secondary": "#5F5B9E",
      "belly": "#DDE6FA",
      "accent": "#8DE6CF"
    },
    "silhouetteVi": "Cánh dải sáng, lông cổ, đuôi cực quang.",
    "draft": false
  },
  "celestia": {
    "group": "V",
    "respiration": "lung",
    "locomotion": [
      "walk",
      "fly"
    ],
    "protection": "scale",
    "activity": "night",
    "dietIds": [
      "aether"
    ],
    "thermalBands": [
      "cool",
      "mild",
      "warm"
    ],
    "habitatRules": [
      "origin_meadow",
      "sky_low_island"
    ],
    "salinityBands": [
      "none"
    ],
    "depthBands": [
      "none"
    ],
    "altitudeBands": [
      "ground",
      "low"
    ],
    "comfortMin": {
      "airQuality": 85,
      "waterQuality": 0,
      "vegetation": 15,
      "foodAvailability": 70
    },
    "resiliencePct": {
      "wildfire": 75,
      "strong_current": 20,
      "thunderstorm": 90
    },
    "palette": {
      "primary": "#7776B5",
      "secondary": "#45446F",
      "belly": "#D4D2EC",
      "accent": "#E9D48C"
    },
    "silhouetteVi": "Cánh sao, sừng tinh thể, đuôi sao.",
    "draft": false
  },
  "gaia": {
    "group": "A",
    "respiration": "dual",
    "locomotion": [
      "walk",
      "swim"
    ],
    "protection": "armor",
    "activity": "both",
    "dietIds": [
      "leaf",
      "aquatic",
      "aether"
    ],
    "thermalBands": [
      "cool",
      "mild",
      "warm"
    ],
    "habitatRules": [
      "origin_pondbank",
      "ocean_estuary"
    ],
    "salinityBands": [
      "brackish",
      "fresh"
    ],
    "depthBands": [
      "none",
      "shallow"
    ],
    "altitudeBands": [
      "ground"
    ],
    "comfortMin": {
      "airQuality": 75,
      "waterQuality": 80,
      "vegetation": 65,
      "foodAvailability": 75
    },
    "resiliencePct": {
      "wildfire": 55,
      "strong_current": 90,
      "thunderstorm": 35
    },
    "palette": {
      "primary": "#629B7D",
      "secondary": "#385D57",
      "belly": "#DDE5B6",
      "accent": "#E8C97F"
    },
    "silhouetteVi": "Sừng cây, giáp đá-rêu, chân màng và vây.",
    "draft": false
  }
} as const satisfies Record<string, G0Anatomy>;

export type HabitatId = keyof typeof HABITAT_PROFILES;
export type G0SpeciesId = keyof typeof SPECIES_BIOLOGY;
export function getBiology(id: string): G0Anatomy {
  if (!Object.prototype.hasOwnProperty.call(SPECIES_BIOLOGY, id)) throw new Error(`Unknown G0 species: ${id}`);
  return SPECIES_BIOLOGY[id as G0SpeciesId];
}
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
  return { allowed: score >= 50, score, reason: score >= 50 ? 'ok' : 'low-suitability' };
}
