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
  radius: number; // how tightly clustered around the board centre
}

export const BOARD_UNITS = 400;
const PIECE_LENGTH = 92;
const PIECE_THICKNESS = 30;
const DIRS: Dir[] = ["up", "down", "left", "right"];

export const LEVELS: LevelDef[] = [
  { id: "warmup", name: "The Warm-up", blurb: "A loose little cluster — 7 pieces", count: 7, radius: 105 },
  { id: "knot", name: "The Knot", blurb: "A tight, interwoven tangle — 13 pieces", count: 13, radius: 88 },
  { id: "avalanche", name: "The Avalanche", blurb: "A dense heap — 22 pieces, take your time", count: 22, radius: 150 },
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function randomHeap(count: number, radius: number): Piece[] {
  const cx = BOARD_UNITS / 2;
  const cy = BOARD_UNITS / 2;
  const margin = PIECE_LENGTH / 2 + 8;
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    // sqrt spreads points uniformly across the disk rather than bunching at the centre
    const dist = Math.sqrt(Math.random()) * radius;
    const x = clamp(cx + Math.cos(angle) * dist, margin, BOARD_UNITS - margin);
    const y = clamp(cy + Math.sin(angle) * dist, margin, BOARD_UNITS - margin);
    pieces.push({
      id: i,
      x,
      y,
      dir: DIRS[Math.floor(Math.random() * DIRS.length)],
      length: PIECE_LENGTH,
      thickness: PIECE_THICKNESS,
      layer: i,
    });
  }
  return pieces;
}

export function generateHeap(levelId: string): Piece[] {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  for (let attempt = 0; attempt < 300; attempt++) {
    const pieces = randomHeap(level.count, level.radius);
    if (isSolvable(pieces)) return pieces;
  }
  // Practically unreachable, but fall back to a trivially-solvable ring
  // (everyone facing outward from the centre) rather than ever failing.
  const cx = BOARD_UNITS / 2;
  const cy = BOARD_UNITS / 2;
  return Array.from({ length: level.count }, (_, i) => {
    const angle = (i / level.count) * Math.PI * 2;
    const dist = level.radius * 0.6;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const dir: Dir = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? (Math.cos(angle) > 0 ? "right" : "left") : Math.sin(angle) > 0 ? "down" : "up";
    return { id: i, x, y, dir, length: PIECE_LENGTH, thickness: PIECE_THICKNESS, layer: i };
  });
}
