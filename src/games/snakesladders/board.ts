export const BOARD_SIZE = 100;

// [start, end] pairs. Deliberately dense (10 of each on a 100-square board)
// so a game has real back-and-forth instead of ending in a couple of turns.
export const LADDERS: [number, number][] = [
  [2, 23],
  [8, 34],
  [15, 44],
  [20, 41],
  [28, 53],
  [37, 78],
  [49, 67],
  [59, 85],
  [64, 89],
  [77, 97],
];

export const SNAKES: [number, number][] = [
  [98, 79],
  [92, 51],
  [87, 36],
  [83, 19],
  [73, 47],
  [69, 33],
  [62, 22],
  [55, 7],
  [45, 5],
  [32, 10],
];

export const LADDER_MAP = new Map(LADDERS);
export const SNAKE_MAP = new Map(SNAKES);

export interface RowCol {
  row: number;
  col: number;
}

/** Classic boustrophedon layout: 1 bottom-left, zigzagging up to 100 top-left/right. */
export function squareToRowCol(n: number): RowCol {
  const rowFromBottom = Math.floor((n - 1) / 10);
  const withinRow = (n - 1) % 10;
  const leftToRight = rowFromBottom % 2 === 0;
  const col = leftToRight ? withinRow : 9 - withinRow;
  const row = 9 - rowFromBottom;
  return { row, col };
}

export interface Point {
  x: number;
  y: number;
}

export function wavySnakePath(p1: Point, p2: Point, amplitude = 14, segments = 14): string {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const ux = -dy;
  const uy = dx;
  const len = Math.hypot(ux, uy) || 1;
  const px = ux / len;
  const py = uy / len;
  let d = `M ${p1.x} ${p1.y} `;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const bx = p1.x + dx * t;
    const by = p1.y + dy * t;
    const taper = Math.sin(t * Math.PI);
    const offset = Math.sin(t * Math.PI * 3.2) * amplitude * taper;
    d += `L ${bx + px * offset} ${by + py * offset} `;
  }
  return d;
}

export interface LadderGeometry {
  rail1: [Point, Point];
  rail2: [Point, Point];
  rungs: [Point, Point][];
}

export function ladderGeometry(p1: Point, p2: Point, gap = 9): LadderGeometry {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const rail1: [Point, Point] = [
    { x: p1.x + px * gap, y: p1.y + py * gap },
    { x: p2.x + px * gap, y: p2.y + py * gap },
  ];
  const rail2: [Point, Point] = [
    { x: p1.x - px * gap, y: p1.y - py * gap },
    { x: p2.x - px * gap, y: p2.y - py * gap },
  ];
  const rungCount = Math.max(3, Math.round(len / 26));
  const rungs: [Point, Point][] = [];
  for (let i = 1; i < rungCount; i++) {
    const t = i / rungCount;
    const bx = p1.x + dx * t;
    const by = p1.y + dy * t;
    rungs.push([
      { x: bx + px * gap, y: by + py * gap },
      { x: bx - px * gap, y: by - py * gap },
    ]);
  }
  return { rail1, rail2, rungs };
}
