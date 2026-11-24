/**
 * Kiểu dữ liệu sinh học G0 (G0 Decision Pack 1.0, ADR 0003).
 * Tách khỏi module dữ liệu để `types/` không phụ thuộc `data/`.
 */
export type G0Realm = 'land' | 'ocean' | 'sky';
export type TemperatureBand = 'cold' | 'cool' | 'mild' | 'warm' | 'hot';
export type QualityKey = 'airQuality' | 'waterQuality' | 'vegetation' | 'foodAvailability';
export type HazardId = 'wildfire' | 'strong_current' | 'thunderstorm';
export interface G0HabitatEnv {
  zoneId: string; realm: G0Realm; temperatureBand: TemperatureBand;
  humidityBand: 'dry' | 'normal' | 'humid' | 'submerged';
  salinityBand: 'none' | 'fresh' | 'brackish' | 'marine';
  depthBand: 'none' | 'shallow' | 'deep'; altitudeBand: 'ground' | 'low' | 'high';
  perch: boolean; airQuality: number; waterQuality: number; vegetation: number; foodAvailability: number;
}
export interface G0Anatomy {
  group: 'T' | 'A' | 'V'; respiration: 'lung' | 'gill' | 'dual';
  locomotion: readonly ('walk' | 'swim' | 'fly' | 'burrow')[];
  protection: 'scale' | 'armor' | 'fur'; activity: 'day' | 'night' | 'both';
  dietIds: readonly string[]; thermalBands: readonly TemperatureBand[];
  habitatRules: readonly string[]; salinityBands: readonly G0HabitatEnv['salinityBand'][];
  depthBands: readonly G0HabitatEnv['depthBand'][]; altitudeBands: readonly G0HabitatEnv['altitudeBand'][];
  comfortMin: Readonly<Record<QualityKey, number>>;
  resiliencePct: Readonly<Record<HazardId, number>>;
  palette: Readonly<Record<'primary' | 'secondary' | 'belly' | 'accent', string>>;
  silhouetteVi: string; draft: false;
}

