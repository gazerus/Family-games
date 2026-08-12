export const BOARD_SIZE = 8;
export const SHIP_SIZES = [4, 3, 3, 2];

export interface Cell {
  row: number;
  col: number;
}

export type Ship = Cell[];

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function shipCells(row: number, col: number, size: number, horizontal: boolean): Ship | null {
  const cells: Cell[] = [];
  for (let i = 0; i < size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r >= BOARD_SIZE || c >= BOARD_SIZE) return null;
    cells.push({ row: r, col: c });
  }
  return cells;
}

export function canPlace(existing: Ship[], cells: Ship): boolean {
  const occupied = new Set(existing.flatMap((s) => s.map((c) => cellKey(c.row, c.col))));
  return cells.every((c) => !occupied.has(cellKey(c.row, c.col)));
}

// Which sizes are still unplaced, in SHIP_SIZES order (duplicates like the
// two 3-length ships handled as a multiset).
export function remainingSizes(placed: Ship[]): number[] {
  const counts = [...SHIP_SIZES];
  for (const ship of placed) {
    const idx = counts.indexOf(ship.length);
    if (idx !== -1) counts.splice(idx, 1);
  }
  return counts;
}

export function placeFleet(): Ship[] {
  const ships: Ship[] = [];

  for (const size of SHIP_SIZES) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      const cells = shipCells(row, col, size, horizontal);
      if (cells && canPlace(ships, cells)) {
        ships.push(cells);
        placed = true;
      }
    }
    if (!placed) return placeFleet(); // vanishingly rare on an 8x8 board; just retry the whole fleet
  }

  return ships;
}

export function countShipsAfloat(ships: Ship[], hitCells: Set<string>): number {
  return ships.filter((ship) => !ship.every((c) => hitCells.has(cellKey(c.row, c.col)))).length;
}
