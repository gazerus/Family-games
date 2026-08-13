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

// A ship being interactively dragged/rotated during placement, tracked by
// its anchor cell + orientation rather than a raw cell list, so moving or
// rotating it is a cheap update instead of recomputing from scratch.
export interface EditableShip {
  id: number;
  size: number;
  row: number;
  col: number;
  horizontal: boolean;
}

export function shipsToEditable(ships: Ship[]): EditableShip[] {
  return ships.map((cells, id) => {
    const rows = cells.map((c) => c.row);
    const cols = cells.map((c) => c.col);
    return {
      id,
      size: cells.length,
      row: Math.min(...rows),
      col: Math.min(...cols),
      horizontal: new Set(rows).size === 1,
    };
  });
}

export function editableCells(es: EditableShip): Ship {
  // clampEditable (below) always keeps an EditableShip in-bounds for its
  // own size/orientation, so this can't actually return null in practice.
  return shipCells(es.row, es.col, es.size, es.horizontal) ?? [{ row: es.row, col: es.col }];
}

export function clampEditable(es: EditableShip): EditableShip {
  const maxRow = es.horizontal ? BOARD_SIZE - 1 : BOARD_SIZE - es.size;
  const maxCol = es.horizontal ? BOARD_SIZE - es.size : BOARD_SIZE - 1;
  return {
    ...es,
    row: Math.min(Math.max(0, es.row), Math.max(0, maxRow)),
    col: Math.min(Math.max(0, es.col), Math.max(0, maxCol)),
  };
}

export function rotateEditable(es: EditableShip): EditableShip {
  return clampEditable({ ...es, horizontal: !es.horizontal });
}

// Cells occupied by more than one ship — placement allows ships to overlap
// while dragging, but this flags the conflict so it can be highlighted and
// block locking the fleet in until resolved.
export function overlappingCells(ships: EditableShip[]): Set<string> {
  const counts = new Map<string, number>();
  for (const es of ships) {
    for (const c of editableCells(es)) {
      const key = cellKey(c.row, c.col);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const overlaps = new Set<string>();
  for (const [key, count] of counts) if (count > 1) overlaps.add(key);
  return overlaps;
}
