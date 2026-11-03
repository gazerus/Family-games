// Ludo board geometry on a 15x15 grid. Coordinates are [row, col].
//
// A token's progress is counted from its own seat's start square:
//   -1        = still in the yard
//   0..50     = on the shared 52-square loop
//   51..55    = in its own coloured home column
//   56        = finished (in the centre)

export const GRID = 15;
export const TRACK_LEN = 52;
export const LAST_TRACK_STEP = 50;
export const FINISH = 56;
export const TOKENS_PER_PLAYER = 4;

// Clockwise loop, starting at seat 0's start square.
export const TRACK: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

// Each seat's start square is 13 steps further round the loop.
export const SEAT_START = [0, 13, 26, 39];

// Start squares plus the "star" squares 8 steps after each start.
export const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const HOME_COLUMNS: [number, number][][] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
];

// Top-left corner of each seat's 6x6 yard.
const YARD_ORIGIN: [number, number][] = [
  [0, 0],
  [0, 9],
  [9, 9],
  [9, 0],
];

const YARD_SPOTS: [number, number][] = [
  [2, 2],
  [2, 4],
  [4, 2],
  [4, 4],
];

const FINISH_SPOT: [number, number][] = [
  [7.5, 6.85],
  [6.85, 7.5],
  [7.5, 8.15],
  [8.15, 7.5],
];

export function trackIndex(seat: number, progress: number): number {
  return (SEAT_START[seat] + progress) % TRACK_LEN;
}

/** Centre point of a token, in grid-cell units (x = column, y = row). */
export function tokenPoint(seat: number, token: number, progress: number): { x: number; y: number } {
  if (progress < 0) {
    const [r0, c0] = YARD_ORIGIN[seat];
    const [dr, dc] = YARD_SPOTS[token];
    return { x: c0 + dc, y: r0 + dr };
  }
  if (progress >= FINISH) {
    const [r, c] = FINISH_SPOT[seat];
    const jitter = (token - 1.5) * 0.22;
    const horizontal = seat === 1 || seat === 3;
    return { x: c + (horizontal ? jitter : 0), y: r + (horizontal ? 0 : jitter) };
  }
  const [r, c] =
    progress <= LAST_TRACK_STEP
      ? TRACK[trackIndex(seat, progress)]
      : HOME_COLUMNS[seat][progress - LAST_TRACK_STEP - 1];
  return { x: c + 0.5, y: r + 0.5 };
}

export type CellKind =
  | { kind: "track"; safe: boolean; startSeat: number | null }
  | { kind: "home"; seat: number }
  | { kind: "yard"; seat: number }
  | { kind: "centre" }
  | { kind: "empty" };

/** What each of the 225 grid cells is, for drawing the board. */
export function buildCells(): CellKind[][] {
  const cells: CellKind[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, (): CellKind => ({ kind: "empty" }))
  );
  YARD_ORIGIN.forEach(([r0, c0], seat) => {
    for (let r = r0; r < r0 + 6; r++) for (let c = c0; c < c0 + 6; c++) cells[r][c] = { kind: "yard", seat };
  });
  TRACK.forEach(([r, c], i) => {
    const startSeat = SEAT_START.indexOf(i);
    cells[r][c] = { kind: "track", safe: SAFE_INDICES.has(i), startSeat: startSeat >= 0 ? startSeat : null };
  });
  HOME_COLUMNS.forEach((col, seat) => col.forEach(([r, c]) => (cells[r][c] = { kind: "home", seat })));
  for (let r = 6; r <= 8; r++) for (let c = 6; c <= 8; c++) cells[r][c] = { kind: "centre" };
  return cells;
}

/** Which tokens can legally move with this roll. */
export function movableTokens(progress: number[], roll: number): number[] {
  const out: number[] = [];
  progress.forEach((p, i) => {
    if (p < 0) {
      if (roll === 6) out.push(i);
    } else if (p < FINISH && p + roll <= FINISH) {
      out.push(i);
    }
  });
  return out;
}

/** Seats to use for a given number of players (2 players sit opposite). */
export function seatsFor(count: number): number[] {
  if (count === 2) return [0, 2];
  if (count === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}
