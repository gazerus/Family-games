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
  rows: number;
  cols: number;
}

export const BOARD_UNITS = 400;
const SEGMENTS = 3; // each piece spans this many grid cells along its length
const CELL = 30;
const PIECE_LENGTH = CELL * SEGMENTS;
const PIECE_THICKNESS = CELL;

// rows/cols chosen so rows*cols is divisible by SEGMENTS and the block
// reads as a square/rectangle, not a sliver.
export const LEVELS: LevelDef[] = [
  { id: "warmup", name: "The Warm-up", blurb: "A neat little block — 8 pieces", rows: 4, cols: 6 },
  { id: "knot", name: "The Knot", blurb: "A snug square — 12 pieces", rows: 6, cols: 6 },
  { id: "avalanche", name: "The Avalanche", blurb: "A dense block — 24 pieces, take your time", rows: 8, cols: 9 },
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

function shuffled<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Slot {
  row: number;
  col: number;
  horizontal: boolean;
}

/** Exactly tiles a rows x cols grid with 1xSEGMENTS straight pieces (mixed
 * horizontal/vertical), via backtracking. Always fills every cell — the
 * starting heap is a single solid block, no holes. */
function tileGrid(rows: number, cols: number): Slot[] | null {
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const slots: Slot[] = [];

  function firstEmpty(): [number, number] | null {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c]) return [r, c];
      }
    }
    return null;
  }

  function setRange(cells: [number, number][], value: boolean) {
    for (const [r, c] of cells) grid[r][c] = value;
  }

  function backtrack(): boolean {
    const empty = firstEmpty();
    if (!empty) return true;
    const [r, c] = empty;
    for (const horizontal of shuffled([true, false])) {
      const cells: [number, number][] = horizontal
        ? [
            [r, c],
            [r, c + 1],
            [r, c + 2],
          ]
        : [
            [r, c],
            [r + 1, c],
            [r + 2, c],
          ];
      const inBounds = horizontal ? c + SEGMENTS <= cols : r + SEGMENTS <= rows;
      if (!inBounds || cells.some(([rr, cc]) => grid[rr][cc])) continue;
      setRange(cells, true);
      slots.push({ row: r, col: c, horizontal });
      if (backtrack()) return true;
      slots.pop();
      setRange(cells, false);
    }
    return false;
  }

  return backtrack() ? slots : null;
}

function piecesFromSlots(slots: Slot[], rows: number, cols: number): Piece[] {
  const offsetX = (BOARD_UNITS - cols * CELL) / 2;
  const offsetY = (BOARD_UNITS - rows * CELL) / 2;
  return slots.map((slot, id) => {
    const dir: Dir = slot.horizontal
      ? Math.random() < 0.5
        ? "left"
        : "right"
      : Math.random() < 0.5
        ? "up"
        : "down";
    const x = slot.horizontal ? offsetX + (slot.col + SEGMENTS / 2) * CELL : offsetX + (slot.col + 0.5) * CELL;
    const y = slot.horizontal ? offsetY + (slot.row + 0.5) * CELL : offsetY + (slot.row + SEGMENTS / 2) * CELL;
    return { id, x, y, dir, length: PIECE_LENGTH, thickness: PIECE_THICKNESS, layer: id };
  });
}

/** Deterministic, always-solvable fallback — used only if the randomized
 * tiling/direction search below is somehow exhausted. Fills every row (or
 * column) with same-direction pieces: since rows/columns never block each
 * other, they peel off left-to-right (or top-to-bottom) over a few passes. */
function stripeFallback(rows: number, cols: number): Piece[] {
  const slots: Slot[] = [];
  if (cols % SEGMENTS === 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c += SEGMENTS) slots.push({ row: r, col: c, horizontal: true });
    }
  } else {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r += SEGMENTS) slots.push({ row: r, col: c, horizontal: false });
    }
  }
  return piecesFromSlots(slots, rows, cols).map((p) => ({
    ...p,
    dir: p.dir === "left" || p.dir === "right" ? "right" : "down",
  }));
}

export function generateHeap(levelId: string): Piece[] {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  for (let tilingAttempt = 0; tilingAttempt < 40; tilingAttempt++) {
    const slots = tileGrid(level.rows, level.cols);
    if (!slots) continue;
    for (let dirAttempt = 0; dirAttempt < 40; dirAttempt++) {
      const pieces = piecesFromSlots(slots, level.rows, level.cols);
      if (isSolvable(pieces)) return pieces;
    }
  }
  return stripeFallback(level.rows, level.cols);
}
