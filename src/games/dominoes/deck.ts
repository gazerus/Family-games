import { shuffle } from "../shuffle";

export interface Tile {
  id: number;
  a: number;
  b: number;
}

export const HAND_SIZE = 7;

export function makeDeck(): Tile[] {
  const deck: Tile[] = [];
  let id = 0;
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      deck.push({ id: id++, a, b });
    }
  }
  return shuffle(deck);
}

export function pipSum(tiles: Tile[]): number {
  return tiles.reduce((sum, t) => sum + t.a + t.b, 0);
}

/** Real domino rule: whoever holds the highest double leads (highest tile overall if nobody has one). */
export function findStartingPlayer(
  order: string[],
  hands: Record<string, Tile[]>
): { playerId: string; tile: Tile } {
  let best: { playerId: string; tile: Tile; rank: number } | null = null;
  for (const playerId of order) {
    for (const t of hands[playerId]) {
      if (t.a !== t.b) continue;
      const rank = 100 + t.a;
      if (!best || rank > best.rank) best = { playerId, tile: t, rank };
    }
  }
  if (best) return best;
  for (const playerId of order) {
    for (const t of hands[playerId]) {
      const rank = t.a + t.b;
      if (!best || rank > best.rank) best = { playerId, tile: t, rank };
    }
  }
  return best!;
}

export function matchesEnd(tile: Tile, end: number): boolean {
  return tile.a === end || tile.b === end;
}

/** Orients the tile so its two pips read in the direction the chain is growing. */
export function orientForEnd(tile: Tile, end: number, side: "left" | "right"): Tile {
  if (side === "right") {
    return tile.a === end ? tile : { ...tile, a: tile.b, b: tile.a };
  }
  return tile.b === end ? tile : { ...tile, a: tile.b, b: tile.a };
}
