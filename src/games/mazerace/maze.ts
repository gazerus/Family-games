// Wall bits: which sides of a cell are OPEN (passable), not walled.
export const NORTH = 1;
export const EAST = 2;
export const SOUTH = 4;
export const WEST = 8;

const OPPOSITE: Record<number, number> = { [NORTH]: SOUTH, [SOUTH]: NORTH, [EAST]: WEST, [WEST]: EAST };
const DELTA: Record<number, [number, number]> = {
  [NORTH]: [-1, 0],
  [SOUTH]: [1, 0],
  [EAST]: [0, 1],
  [WEST]: [0, -1],
};

export interface Cell {
  row: number;
  col: number;
}

export interface Maze {
  width: number;
  height: number;
  // open[row][col] is a bitmask of NORTH|EAST|SOUTH|WEST sides that are open.
  open: number[][];
}

export type PowerUpKind = "speed" | "reveal";

export interface PowerUp {
  row: number;
  col: number;
  kind: PowerUpKind;
}

// Deterministic PRNG (mulberry32) so both players can generate the exact
// same maze locally from a shared numeric seed without transmitting the
// grid itself over the network.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Recursive backtracker (randomized DFS): carves a perfect maze (exactly one
// path between any two cells). `braid` optionally knocks out a fraction of
// dead ends afterward by opening one extra wall, giving easier mazes more
// than one route and fewer frustrating dead ends for younger players.
export function generateMaze(seed: number, width: number, height: number, braid = 0): Maze {
  const rng = makeRng(seed);
  const open: number[][] = Array.from({ length: height }, () => Array(width).fill(0));
  const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));

  const stack: Cell[] = [{ row: 0, col: 0 }];
  visited[0][0] = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const dirs = shuffleDirs(rng);
    let advanced = false;

    for (const dir of dirs) {
      const [dr, dc] = DELTA[dir];
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width || visited[nr][nc]) continue;

      open[current.row][current.col] |= dir;
      open[nr][nc] |= OPPOSITE[dir];
      visited[nr][nc] = true;
      stack.push({ row: nr, col: nc });
      advanced = true;
      break;
    }

    if (!advanced) stack.pop();
  }

  if (braid > 0) {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const degree = popcount(open[r][c]);
        if (degree !== 1) continue; // only widen dead ends
        if (rng() > braid) continue;
        const dirs = shuffleDirs(rng);
        for (const dir of dirs) {
          const [dr, dc] = DELTA[dir];
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
          if (open[r][c] & dir) continue; // already open that way
          open[r][c] |= dir;
          open[nr][nc] |= OPPOSITE[dir];
          break;
        }
      }
    }
  }

  return { width, height, open };
}

function popcount(mask: number): number {
  let n = 0;
  for (let b = 1; b <= WEST; b <<= 1) if (mask & b) n++;
  return n;
}

function shuffleDirs(rng: () => number): number[] {
  const dirs = [NORTH, EAST, SOUTH, WEST];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  return dirs;
}

// BFS shortest path from entrance (0,0) to exit (width-1, height-1) — the
// maze is a perfect tree so this is also the *only* path, used both to
// validate solvability and to drive the "reveal next 3 cells" power-up.
export function solveMaze(maze: Maze): Cell[] {
  const { width, height, open } = maze;
  const from = new Map<string, string>();
  const key = (r: number, c: number) => `${r},${c}`;
  const start = { row: 0, col: 0 };
  const goal = { row: height - 1, col: width - 1 };

  const visited = new Set<string>([key(0, 0)]);
  const queue: Cell[] = [start];
  let qi = 0;

  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur.row === goal.row && cur.col === goal.col) break;
    for (const dir of [NORTH, EAST, SOUTH, WEST]) {
      if (!(open[cur.row][cur.col] & dir)) continue;
      const [dr, dc] = DELTA[dir];
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      const k = key(nr, nc);
      if (visited.has(k)) continue;
      visited.add(k);
      from.set(k, key(cur.row, cur.col));
      queue.push({ row: nr, col: nc });
    }
  }

  const path: Cell[] = [];
  let cur = key(goal.row, goal.col);
  if (!visited.has(cur)) return path;
  while (cur !== key(0, 0)) {
    const [r, c] = cur.split(",").map(Number);
    path.push({ row: r, col: c });
    cur = from.get(cur)!;
  }
  path.push(start);
  path.reverse();
  return path;
}

export function placePowerUps(maze: Maze, path: Cell[], rng: () => number, count: number): PowerUp[] {
  // Pick from cells one step off the solution path where possible (a small
  // detour to grab one), falling back to on-path cells for tiny mazes.
  const pathKeys = new Set(path.map((c) => `${c.row},${c.col}`));
  const candidates: Cell[] = [];
  for (let r = 0; r < maze.height; r++) {
    for (let c = 0; c < maze.width; c++) {
      if (r === 0 && c === 0) continue;
      if (r === maze.height - 1 && c === maze.width - 1) continue;
      candidates.push({ row: r, col: c });
    }
  }
  // Prefer off-path cells (a small detour) if there are enough of them.
  const offPath = candidates.filter((c) => !pathKeys.has(`${c.row},${c.col}`));
  const pool = offPath.length >= count ? offPath : candidates;

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count).map((cell, i) => ({
    ...cell,
    kind: i % 2 === 0 ? "speed" : "reveal",
  }));
}
