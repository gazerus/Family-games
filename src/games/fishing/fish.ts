export type Difficulty = "easy" | "standard";
export type FishKind = "common" | "gold";

export interface FishConfig {
  spawnMsRange: [number, number];
  speedRange: [number, number];
  sizeRange: [number, number];
  goldChance: number;
}

// Bigger and slower for younger players, faster and smaller for older ones —
// the shared pond stays the same shape, only the fish themselves change.
export const FISH_CONFIG: Record<Difficulty, FishConfig> = {
  easy: { spawnMsRange: [900, 1600], speedRange: [40, 70], sizeRange: [46, 60], goldChance: 0.18 },
  standard: { spawnMsRange: [450, 950], speedRange: [95, 160], sizeRange: [26, 36], goldChance: 0.12 },
};

export const POINTS: Record<FishKind, number> = { common: 1, gold: 5 };
