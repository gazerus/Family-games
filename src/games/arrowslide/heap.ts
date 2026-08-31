export type Dir = "up" | "down" | "left" | "right";

export interface Cell {
  row: number;
  col: number;
  x: number; // board-unit centre of this cell
  y: number;
}

export interface Piece {
  id: number;
  cells: Cell[]; // ordered tail (dead end) -> head (arrow end)
  dir: Dir; // direction the head-end arrow points, and the piece slides
}

export interface LevelDef {
  id: string;
  name: string;
  blurb: string;
  rows: number;
  cols: number;
}

export const BOARD_UNITS = 400;
const PIECE_LEN = 4; // cells per piece — an L/S/Z/I/U-shaped "pipe" path
export const CELL = 30;

// rows*cols must be divisible by PIECE_LEN so the block tiles exactly.
export const LEVELS: LevelDef[] = [
  { id: "warmup", name: "The Warm-up", blurb: "A neat little block — 6 pieces", rows: 4, cols: 6 },
  { id: "knot", name: "The Knot", blurb: "A snug square — 9 pieces", rows: 6, cols: 6 },
  { id: "avalanche", name: "The Avalanche", blurb: "A dense block — 18 pieces, take your time", rows: 8, cols: 9 },
];

const DIR_VECTORS: Record<Dir, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

function directionBetween(from: [number, number], to: [number, number]): Dir {
  const dr = to[0] - from[0];
  const dc = to[1] - from[1];
  if (dr === -1) return "up";
  if (dr === 1) return "down";
  if (dc === -1) return "left";
  return "right";
}

/** True if nothing else in `pieces` blocks this piece's straight-line slide
 * out in its arrow direction — every cell of the piece must have a clear
 * runway (no foreign cell) all the way to the board edge. */
export function canClear(piece: Piece, pieces: Piece[]): boolean {
  const occupied = new Set<string>();
  for (const other of pieces) {
    if (other.id === piece.id) continue;
    for (const cell of other.cells) occupied.add(`${cell.row},${cell.col}`);
  }
  const { dr, dc } = DIR_VECTORS[piece.dir];
  for (const cell of piece.cells) {
    let r = cell.row + dr;
    let c = cell.col + dc;
    // 40 steps is far more than any board dimension we use — once we're
    // that far past the grid, nothing else could possibly be occupying it.
    for (let step = 0; step < 40; step++) {
      if (occupied.has(`${r},${c}`)) return false;
      r += dr;
      c += dc;
    }
  }
  return true;
}

/** Board-unit distance the piece must travel along its arrow direction to
 * be fully clear of the board (with a generous overshoot for a clean glide). */
export function distanceToExit(piece: Piece): number {
  const overshoot = PIECE_LEN * CELL;
  switch (piece.dir) {
    case "right": {
      const maxX = Math.max(...piece.cells.map((c) => c.x));
      return BOARD_UNITS - (maxX + CELL / 2) + overshoot;
    }
    case "left": {
      const minX = Math.min(...piece.cells.map((c) => c.x));
      return minX - CELL / 2 + overshoot;
    }
    case "down": {
      const maxY = Math.max(...piece.cells.map((c) => c.y));
      return BOARD_UNITS - (maxY + CELL / 2) + overshoot;
    }
    case "up": {
      const minY = Math.min(...piece.cells.map((c) => c.y));
      return minY - CELL / 2 + overshoot;
    }
  }
}

function shuffled<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const DIRS: Dir[] = ["up", "down", "left", "right"];

/** Exactly tiles a rows x cols grid with PIECE_LEN-cell self-avoiding-walk
 * "pipe" pieces (straight runs, L/S/Z turns, even tight U-hooks), via
 * backtracking. Always fills every cell — the starting heap is one solid
 * interlocking block, no holes. */
function tileGrid(rows: number, cols: number): [number, number][][] | null {
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const slots: [number, number][][] = [];

  function firstEmpty(): [number, number] | null {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c]) return [r, c];
      }
    }
    return null;
  }

  function extend(cells: [number, number][]): boolean {
    if (cells.length === PIECE_LEN) {
      slots.push(cells.slice());
      if (backtrack()) return true;
      slots.pop();
      return false;
    }
    const [r, c] = cells[cells.length - 1];
    for (const dir of shuffled(DIRS)) {
      const { dr, dc } = DIR_VECTORS[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc]) continue;
      grid[nr][nc] = true;
      cells.push([nr, nc]);
      if (extend(cells)) return true;
      cells.pop();
      grid[nr][nc] = false;
    }
    return false;
  }

  function backtrack(): boolean {
    const start = firstEmpty();
    if (!start) return true;
    const [r0, c0] = start;
    grid[r0][c0] = true;
    if (extend([[r0, c0]])) return true;
    grid[r0][c0] = false;
    return false;
  }

  return backtrack() ? slots : null;
}

function cellCentre(r: number, c: number, offsetX: number, offsetY: number): { x: number; y: number } {
  return { x: offsetX + (c + 0.5) * CELL, y: offsetY + (r + 0.5) * CELL };
}

interface Candidate {
  id: number;
  path: [number, number][];
  options: [{ dir: Dir; cells: Cell[] }, { dir: Dir; cells: Cell[] }];
}

function candidatesFromSlots(slots: [number, number][][], rows: number, cols: number): Candidate[] {
  const offsetX = (BOARD_UNITS - cols * CELL) / 2;
  const offsetY = (BOARD_UNITS - rows * CELL) / 2;
  return slots.map((path, id) => {
    const toCells = (ordered: [number, number][]): Cell[] =>
      ordered.map(([r, c]) => ({ row: r, col: c, ...cellCentre(r, c, offsetX, offsetY) }));
    const dirFwd = directionBetween(path[path.length - 2], path[path.length - 1]);
    const dirRev = directionBetween(path[1], path[0]);
    return {
      id,
      path,
      options: [
        { dir: dirFwd, cells: toCells(path) },
        { dir: dirRev, cells: toCells(path.slice().reverse()) },
      ],
    };
  });
}

function canClearRaw(path: [number, number][], dir: Dir, occupied: Set<string>): boolean {
  const { dr, dc } = DIR_VECTORS[dir];
  for (const [row, col] of path) {
    let r = row + dr;
    let c = col + dc;
    for (let step = 0; step < 40; step++) {
      if (occupied.has(`${r},${c}`)) return false;
      r += dr;
      c += dc;
    }
  }
  return true;
}

/** Tries to construct a fully-solvable direction assignment for this exact
 * tiling by simulating the real clearing process: repeatedly find any
 * remaining piece with a currently-clear escape (in either of its two
 * possible directions) and "remove" it. The processing order is shuffled,
 * so a tiling that's solvable at all is usually found within a few
 * attempts even when a particular order deadlocks. Returns null if this
 * exact tiling turns out to be geometrically unsolvable no matter the
 * direction choices. */
function tryAssignDirections(candidates: Candidate[]): Piece[] | null {
  const remaining = new Map(candidates.map((c) => [c.id, c]));
  const solved = new Map<number, { dir: Dir; cells: Cell[] }>();
  let progressed = true;
  while (progressed && remaining.size > 0) {
    progressed = false;
    for (const cand of shuffled(Array.from(remaining.values()))) {
      const occupied = new Set<string>();
      for (const other of remaining.values()) {
        if (other.id === cand.id) continue;
        for (const [r, c] of other.path) occupied.add(`${r},${c}`);
      }
      const opt = shuffled([...cand.options]).find((o) => canClearRaw(cand.path, o.dir, occupied));
      if (opt) {
        solved.set(cand.id, opt);
        remaining.delete(cand.id);
        progressed = true;
      }
    }
  }
  if (remaining.size > 0) return null;
  return candidates.map((c) => {
    const chosen = solved.get(c.id)!;
    return { id: c.id, cells: chosen.cells, dir: chosen.dir };
  });
}

export function generateHeap(levelId: string): Piece[] {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  let lastCandidates: Candidate[] = [];
  // Whether a given tiling is solvable at all is independent of processing
  // order (removing a piece can only ever open up paths for others, never
  // block them), so retrying the same tiling can't help — only trying a
  // genuinely different tiling can, hence one shot per tiling but many
  // tilings tried.
  for (let tilingAttempt = 0; tilingAttempt < 300; tilingAttempt++) {
    const slots = tileGrid(level.rows, level.cols);
    if (!slots) continue;
    const candidates = candidatesFromSlots(slots, level.rows, level.cols);
    lastCandidates = candidates;
    const pieces = tryAssignDirections(candidates);
    if (pieces) return pieces;
  }
  // Practically unreachable given the retry budget above: fall back to
  // whatever the last tiling's default direction assignment was — still a
  // full valid tiling, just not guaranteed fully solvable.
  return lastCandidates.map((c) => ({ id: c.id, cells: c.options[0].cells, dir: c.options[0].dir }));
}
