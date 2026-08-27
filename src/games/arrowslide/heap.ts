export type Dir = "up" | "down" | "left" | "right";

export interface Piece {
  id: number;
  x: number; // centre, in board units
  y: number;
  dir: Dir;
  length: number; // along its own direction axis
  thickness: number; // across it
  layer: number; // purely visual stacking (z-index) — has no effect on collision
}

export interface LevelDef {
  id: string;
  name: string;
  blurb: string;
  count: number;
}

export const BOARD_UNITS = 400;
const PIECE_LENGTH = 80;
const PIECE_THICKNESS = 24;
const PIECE_GAP = 5; // minimum breathing room between pieces so they read as distinct, non-overlapping
const DIRS: Dir[] = ["up", "down", "left", "right"];

export const LEVELS: LevelDef[] = [
  { id: "warmup", name: "The Warm-up", blurb: "A loose scatter — 7 pieces", count: 7 },
  { id: "knot", name: "The Knot", blurb: "A snug arrangement — 13 pieces", count: 13 },
  { id: "avalanche", name: "The Avalanche", blurb: "Tightly packed — 22 pieces, take your time", count: 22 },
];

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function pieceRect(p: Pick<Piece, "x" | "y" | "dir" | "length" | "thickness">): Rect {
  const halfL = p.length / 2;
  const halfT = p.thickness / 2;
  if (p.dir === "left" || p.dir === "right") {
    return { left: p.x - halfL, right: p.x + halfL, top: p.y - halfT, bottom: p.y + halfT };
  }
  return { left: p.x - halfT, right: p.x + halfT, top: p.y - halfL, bottom: p.y + halfL };
}

// The rectangle a piece sweeps through on its way off the board, from its
// own leading edge out past the boundary.
function escapeRect(p: Pick<Piece, "x" | "y" | "dir" | "length" | "thickness">): Rect {
  const own = pieceRect(p);
  const far = BOARD_UNITS * 1.5;
  const near = -BOARD_UNITS * 0.5;
  switch (p.dir) {
    case "right":
      return { left: own.right, right: far, top: own.top, bottom: own.bottom };
    case "left":
      return { left: near, right: own.left, top: own.top, bottom: own.bottom };
    case "down":
      return { left: own.left, right: own.right, top: own.bottom, bottom: far };
    case "up":
      return { left: own.left, right: own.right, top: near, bottom: own.top };
  }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function inflateRect(r: Rect, pad: number): Rect {
  return { left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad };
}

/** Total distance (in board units) a piece must travel along its own axis
 * to be fully clear of the board, from its current position. */
export function distanceToExit(p: Pick<Piece, "x" | "y" | "dir" | "length">): number {
  const halfL = p.length / 2;
  switch (p.dir) {
    case "right":
      return BOARD_UNITS - (p.x - halfL) + p.length;
    case "left":
      return p.x + halfL + p.length;
    case "down":
      return BOARD_UNITS - (p.y - halfL) + p.length;
    case "up":
      return p.y + halfL + p.length;
  }
}

/** True if nothing else in `pieces` blocks this piece's escape path. */
export function canClear(piece: Piece, pieces: Piece[]): boolean {
  const path = escapeRect(piece);
  for (const other of pieces) {
    if (other.id === piece.id) continue;
    if (rectsOverlap(path, pieceRect(other))) return false;
  }
  return true;
}

function isSolvable(pieces: Piece[]): boolean {
  const remaining = new Map(pieces.map((p) => [p.id, p]));
  let progressed = true;
  while (progressed && remaining.size > 0) {
    progressed = false;
    for (const p of Array.from(remaining.values())) {
      if (canClear(p, Array.from(remaining.values()))) {
        remaining.delete(p.id);
        progressed = true;
      }
    }
  }
  return remaining.size === 0;
}

/** Places `count` pieces one at a time, rejecting any spot that overlaps an
 * already-placed piece (padded by PIECE_GAP), so the heap always renders as
 * flat, non-overlapping pieces in 2D. Returns null if it couldn't fit them
 * all after a generous number of tries. */
function tryPack(count: number): Piece[] | null {
  const margin = PIECE_LENGTH / 2 + 6;
  const pieces: Piece[] = [];
  for (let id = 0; id < count; id++) {
    let placed = false;
    for (let attempt = 0; attempt < 400; attempt++) {
      const x = margin + Math.random() * (BOARD_UNITS - margin * 2);
      const y = margin + Math.random() * (BOARD_UNITS - margin * 2);
      const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
      const candidate: Piece = { id, x, y, dir, length: PIECE_LENGTH, thickness: PIECE_THICKNESS, layer: id };
      const padded = inflateRect(pieceRect(candidate), PIECE_GAP / 2);
      if (!pieces.some((p) => rectsOverlap(padded, pieceRect(p)))) {
        pieces.push(candidate);
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }
  return pieces;
}

/** Deterministic, always-non-overlapping, always-solvable grid fallback for
 * the rare case random packing can't find room within the retry budget. */
function gridFallback(count: number): Piece[] {
  const cols = Math.ceil(Math.sqrt(count));
  const cellW = BOARD_UNITS / cols;
  const rows = Math.ceil(count / cols);
  const cellH = BOARD_UNITS / rows;
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: i,
      x: cellW * (col + 0.5),
      y: cellH * (row + 0.5),
      dir: (["up", "down", "left", "right"] as Dir[])[i % 4],
      length: Math.min(PIECE_LENGTH, cellW - 8, cellH - 8),
      thickness: Math.min(PIECE_THICKNESS, cellW - 12, cellH - 12),
      layer: i,
    };
  });
}

export function generateHeap(levelId: string): Piece[] {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  for (let attempt = 0; attempt < 200; attempt++) {
    const pieces = tryPack(level.count);
    if (pieces && isSolvable(pieces)) return pieces;
  }
  return gridFallback(level.count);
}
