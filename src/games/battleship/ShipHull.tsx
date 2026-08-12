import { BOARD_SIZE, type Ship } from "./fleet";

const HULL_GRADIENT: Record<number, string> = {
  4: "linear-gradient(160deg, #64748b, #334155)",
  3: "linear-gradient(160deg, #38bdf8, #0369a1)",
  2: "linear-gradient(160deg, #2dd4bf, #0d9488)",
};

const SHIP_NAMES: Record<number, string> = {
  4: "Battleship",
  3: "Cruiser",
  2: "Patrol Boat",
};

export function shipName(size: number): string {
  return SHIP_NAMES[size] ?? `${size}-length ship`;
}

// Renders a ship as a single pointed-bow hull spanning its cells, positioned
// by percentage over the 8x8 grid so it never depends on measured pixel
// sizes and can't desync from the grid layout underneath it.
export function ShipHull({ ship }: { ship: Ship }) {
  const rows = ship.map((c) => c.row);
  const cols = ship.map((c) => c.col);
  const minRow = Math.min(...rows);
  const minCol = Math.min(...cols);
  const horizontal = new Set(rows).size === 1;
  const size = ship.length;

  const left = (minCol / BOARD_SIZE) * 100;
  const top = (minRow / BOARD_SIZE) * 100;
  const width = ((horizontal ? size : 1) / BOARD_SIZE) * 100;
  const height = ((horizontal ? 1 : size) / BOARD_SIZE) * 100;

  return (
    <div
      className={`bs-hull ${horizontal ? "bs-hull--h" : "bs-hull--v"}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
        backgroundImage: HULL_GRADIENT[size] ?? HULL_GRADIENT[2],
      }}
      title={shipName(size)}
    />
  );
}
