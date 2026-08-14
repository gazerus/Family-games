export type Dir = "up" | "down" | "left" | "right";

export interface Piece {
  id: number;
  row: number;
  col: number;
  dir: Dir;
}

export const GRID_SIZE = 5;

const DIRS: Dir[] = ["up", "down", "left", "right"];
const DELTA: Record<Dir, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

function key(row: number, col: number): string {
  return `${row},${col}`;
}

// A board is only fun if it's actually clearable: repeatedly remove any
// piece whose straight-line path to the boundary is currently unobstructed,
// same as a player tapping only pieces that go straight off the board. If
// that process empties the grid, a full solution exists (a player never
// *needs* to rely on the partial "bump and stop" move, though they still can).
function isSolvable(pieces: Piece[]): boolean {
  const occupied = new Set(pieces.map((p) => key(p.row, p.col)));
  const remaining = new Map(pieces.map((p) => [p.id, p]));
  let progressed = true;
  while (progressed && remaining.size > 0) {
    progressed = false;
    for (const p of Array.from(remaining.values())) {
      const [dr, dc] = DELTA[p.dir];
      let r = p.row + dr;
      let c = p.col + dc;
      let clear = true;
      while (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        if (occupied.has(key(r, c))) {
          clear = false;
          break;
        }
        r += dr;
        c += dc;
      }
      if (clear) {
        occupied.delete(key(p.row, p.col));
        remaining.delete(p.id);
        progressed = true;
      }
    }
  }
  return remaining.size === 0;
}

export function generateGrid(): Piece[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const pieces: Piece[] = [];
    let id = 0;
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        pieces.push({ id: id++, row, col, dir: DIRS[Math.floor(Math.random() * DIRS.length)] });
      }
    }
    if (isSolvable(pieces)) return pieces;
  }
  // Practically unreachable for a 5x5 board, but a guaranteed-solvable
  // pinwheel (each quadrant points straight out) covers it just in case.
  const pieces: Piece[] = [];
  let id = 0;
  const mid = (GRID_SIZE - 1) / 2;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const dir: Dir = row <= mid ? (col <= mid ? "up" : "right") : col <= mid ? "left" : "down";
      pieces.push({ id: id++, row, col, dir });
    }
  }
  return pieces;
}

export interface SlideResult {
  pieces: Piece[];
  moved: boolean;
  cleared: boolean;
}

/** Slides one piece in its own direction as far as it can go. */
export function slidePiece(pieces: Piece[], pieceId: number): SlideResult {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return { pieces, moved: false, cleared: false };
  const [dr, dc] = DELTA[piece.dir];
  const occupied = new Set(pieces.filter((p) => p.id !== pieceId).map((p) => key(p.row, p.col)));

  let nr = piece.row;
  let nc = piece.col;
  for (;;) {
    const tryR = nr + dr;
    const tryC = nc + dc;
    if (tryR < 0 || tryR >= GRID_SIZE || tryC < 0 || tryC >= GRID_SIZE) {
      return { pieces: pieces.filter((p) => p.id !== pieceId), moved: true, cleared: true };
    }
    if (occupied.has(key(tryR, tryC))) break;
    nr = tryR;
    nc = tryC;
  }
  if (nr === piece.row && nc === piece.col) return { pieces, moved: false, cleared: false };
  return {
    pieces: pieces.map((p) => (p.id === pieceId ? { ...p, row: nr, col: nc } : p)),
    moved: true,
    cleared: false,
  };
}
