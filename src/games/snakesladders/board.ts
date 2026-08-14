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

export interface SnakeStyle {
  fill: string;
  stripeColor?: string;
}

// Distinct look per snake so all 10 on the board read as separate
// creatures rather than identical squiggles. Indexed 1:1 against SNAKES.
export const SNAKE_STYLES: SnakeStyle[] = [
  { fill: "#16a34a" }, // green
  { fill: "#92400e" }, // brown
  { fill: "#1f2937", stripeColor: "#f97316" }, // black, orange stripes
  { fill: "#0891b2" }, // teal
  { fill: "#7c3aed" }, // purple
  { fill: "#b91c1c" }, // red
  { fill: "#3f6212", stripeColor: "#fde047" }, // olive, yellow stripes
  { fill: "#0f172a" }, // near-black
  { fill: "#ca8a04" }, // mustard
  { fill: "#831843" }, // maroon
];

export interface SnakeBody {
  bodyPath: string;
  headCenter: Point;
  headForward: Point; // unit vector pointing from head into the body
}

// A snake's "head" is at the higher square (p1) — where it bites the
// player — tapering to a "tail" at the lower square (p2), where they slide
// out. Built as a filled ribbon (not a uniform stroked line) so the width
// can actually taper, with each cross-section's width and normal computed
// from the wavy centerline itself so the ribbon hugs its own curve.
export function snakeBody(p1: Point, p2: Point, amplitude = 12, segments = 22): SnakeBody {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const ux = -dy;
  const uy = dx;
  const baseLen = Math.hypot(ux, uy) || 1;
  const bpx = ux / baseLen;
  const bpy = uy / baseLen;

  const center: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const bx = p1.x + dx * t;
    const by = p1.y + dy * t;
    const taper = Math.sin(t * Math.PI);
    const offset = Math.sin(t * Math.PI * 3.2) * amplitude * taper;
    center.push({ x: bx + bpx * offset, y: by + bpy * offset });
  }

  // Width profile: a distinct head at the widest point, narrowing quickly
  // into a long body section of consistent width, then tapering to a point
  // only over the final stretch near the tail — not a gradual taper along
  // the whole length.
  const headWidth = 10;
  const bodyWidth = 6.5;
  const tailWidth = 1.5;
  const neckEnd = 0.12; // head narrows to body width by this fraction
  const tailStart = 0.72; // tail taper begins this far along
  function widthAt(t: number): number {
    if (t <= neckEnd) {
      const u = t / neckEnd;
      const eased = 1 - Math.pow(1 - u, 2);
      return headWidth + (bodyWidth - headWidth) * eased;
    }
    if (t <= tailStart) return bodyWidth;
    const u = (t - tailStart) / (1 - tailStart);
    return bodyWidth + (tailWidth - bodyWidth) * Math.pow(u, 1.3);
  }
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < center.length; i++) {
    const t = i / (center.length - 1);
    const width = widthAt(t);
    const prev = center[Math.max(0, i - 1)];
    const next = center[Math.min(center.length - 1, i + 1)];
    const tdx = next.x - prev.x;
    const tdy = next.y - prev.y;
    const tlen = Math.hypot(tdx, tdy) || 1;
    const npx = -tdy / tlen;
    const npy = tdx / tlen;
    const c = center[i];
    left.push({ x: c.x + npx * (width / 2), y: c.y + npy * (width / 2) });
    right.push({ x: c.x - npx * (width / 2), y: c.y - npy * (width / 2) });
  }

  let bodyPath = `M ${left[0].x} ${left[0].y} `;
  for (let i = 1; i < left.length; i++) bodyPath += `L ${left[i].x} ${left[i].y} `;
  for (let i = right.length - 1; i >= 0; i--) bodyPath += `L ${right[i].x} ${right[i].y} `;
  bodyPath += "Z";

  const headForwardRaw = { x: center[1].x - center[0].x, y: center[1].y - center[0].y };
  const flen = Math.hypot(headForwardRaw.x, headForwardRaw.y) || 1;

  return {
    bodyPath,
    headCenter: center[0],
    headForward: { x: headForwardRaw.x / flen, y: headForwardRaw.y / flen },
  };
}

// A wedge-shaped head silhouette (flat-ish jaw bulge tapering to a
// pointed snout) instead of a plain circle, so the head actually reads as
// a snake head rather than a blob. `headForward` points from the head
// into the body (per SnakeBody), so the snout extends the opposite way.
export function snakeHeadPath(headCenter: Point, headForward: Point, baseHalfWidth: number): string {
  const outX = -headForward.x;
  const outY = -headForward.y;
  const sideX = -headForward.y;
  const sideY = headForward.x;
  const len = baseHalfWidth * 3.2;

  function pt(alongFrac: number, sideFrac: number): Point {
    return {
      x: headCenter.x + outX * len * alongFrac + sideX * baseHalfWidth * sideFrac,
      y: headCenter.y + outY * len * alongFrac + sideY * baseHalfWidth * sideFrac,
    };
  }

  const baseL = pt(0, 1);
  const jawL = pt(0.35, 1.05);
  const snoutL = pt(0.75, 0.4);
  const tip = pt(1, 0);
  const snoutR = pt(0.75, -0.4);
  const jawR = pt(0.35, -1.05);
  const baseR = pt(0, -1);

  return [baseL, jawL, snoutL, tip, snoutR, jawR, baseR]
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ") + " Z";
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
