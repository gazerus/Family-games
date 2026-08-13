export type Difficulty = "easy" | "medium" | "difficult";
export type FishKind = "common" | "gold";

export interface FishConfig {
  spawnMsRange: [number, number];
  speedRange: [number, number];
  sizeRange: [number, number];
  goldChance: number;
}

// Bigger and slower for younger players, faster and smaller for older ones —
// the shared pond stays the same shape, only the fish themselves change.
// Easy is 3x the original easy fish size, Medium is 2x the original medium
// size; Difficult reuses the original (pre-2x) medium fish size at +25%
// speed over medium's current speed.
export const FISH_CONFIG: Record<Difficulty, FishConfig> = {
  easy: { spawnMsRange: [900, 1600], speedRange: [40, 70], sizeRange: [138, 180], goldChance: 0.18 },
  medium: { spawnMsRange: [450, 950], speedRange: [95, 160], sizeRange: [52, 72], goldChance: 0.12 },
  difficult: { spawnMsRange: [450, 950], speedRange: [119, 200], sizeRange: [26, 36], goldChance: 0.12 },
};

export const POINTS: Record<FishKind, number> = { common: 1, gold: 5 };
