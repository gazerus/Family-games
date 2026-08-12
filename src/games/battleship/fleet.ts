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

export function placeFleet(): Ship[] {
  const ships: Ship[] = [];
  const occupied = new Set<string>();

  for (const size of SHIP_SIZES) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      const cells: Cell[] = [];
      let ok = true;
      for (let i = 0; i < size; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;
        if (r >= BOARD_SIZE || c >= BOARD_SIZE || occupied.has(cellKey(r, c))) {
          ok = false;
          break;
        }
        cells.push({ row: r, col: c });
      }
      if (ok) {
        for (const cell of cells) occupied.add(cellKey(cell.row, cell.col));
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
