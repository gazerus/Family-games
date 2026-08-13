import { useId } from "react";
import { BOARD_SIZE, type Ship } from "./fleet";

interface HullColors {
  deck: string;
  hull: string;
  trim: string;
}

const HULL_COLORS: Record<number, HullColors> = {
  4: { deck: "#64748b", hull: "#334155", trim: "#0f172a" }, // Battleship — slate
  3: { deck: "#38bdf8", hull: "#0369a1", trim: "#075985" }, // Cruiser — blue
  2: { deck: "#2dd4bf", hull: "#0d9488", trim: "#115e59" }, // Patrol Boat — teal
};

const SHIP_NAMES: Record<number, string> = {
  4: "Battleship",
  3: "Cruiser",
  2: "Patrol Boat",
};

export function shipName(size: number): string {
  return SHIP_NAMES[size] ?? `${size}-length ship`;
}

const UNIT = 22; // viewBox units per cell of ship length

// A ship is authored in "local" (length, thickness) space with the bow at
// the far end of `length`, then mapped into (x, y) once based on
// orientation — horizontal keeps length on x, vertical swaps it onto y —
// instead of drawing two separate shapes or fighting CSS transform/rotate
// origin math to reuse one.
function point(l: number, t: number, horizontal: boolean): string {
  return horizontal ? `${l},${t}` : `${t},${l}`;
}

export function ShipHull({
  ship,
  draggable = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  ship: Ship;
  draggable?: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const gradId = useId();
  const rows = ship.map((c) => c.row);
  const cols = ship.map((c) => c.col);
  const minRow = Math.min(...rows);
  const minCol = Math.min(...cols);
  const horizontal = new Set(rows).size === 1;
  const size = ship.length;
  const colors = HULL_COLORS[size] ?? HULL_COLORS[2];

  const left = (minCol / BOARD_SIZE) * 100;
  const top = (minRow / BOARD_SIZE) * 100;
  const width = ((horizontal ? size : 1) / BOARD_SIZE) * 100;
  const height = ((horizontal ? 1 : size) / BOARD_SIZE) * 100;

  const L = size * UNIT;
  const T = UNIT;
  const pt = (l: number, t: number) => point(l, t, horizontal);
  const viewBox = horizontal ? `0 0 ${L} ${T}` : `0 0 ${T} ${L}`;

  const hullPath = [
    `M ${pt(3, T * 0.14)}`,
    `Q ${pt(1, T * 0.14)} ${pt(1, T * 0.5)}`,
    `Q ${pt(1, T * 0.86)} ${pt(3, T * 0.86)}`,
    `L ${pt(L * 0.76, T * 0.86)}`,
    `Q ${pt(L - 2, T * 0.68)} ${pt(L - 0.5, T * 0.5)}`,
    `Q ${pt(L - 2, T * 0.32)} ${pt(L * 0.76, T * 0.14)}`,
    "Z",
  ].join(" ");

  const deckPath = [
    `M ${pt(5, T * 0.28)}`,
    `Q ${pt(4, T * 0.28)} ${pt(4, T * 0.5)}`,
    `Q ${pt(4, T * 0.72)} ${pt(5, T * 0.72)}`,
    `L ${pt(L * 0.7, T * 0.72)}`,
    `Q ${pt(L - 4, T * 0.6)} ${pt(L - 3.5, T * 0.5)}`,
    `Q ${pt(L - 4, T * 0.4)} ${pt(L * 0.7, T * 0.28)}`,
    "Z",
  ].join(" ");

  const cabinL0 = L * 0.32;
  const cabinLen = UNIT * 0.4;
  const cabinT0 = T * 0.3;
  const cabinThick = T * 0.4;
  const cabinCorner = horizontal ? pt(cabinL0, cabinT0) : pt(cabinT0, cabinL0);
  const [cabinX, cabinY] = cabinCorner.split(",").map(Number);
  const cabinW = horizontal ? cabinLen : cabinThick;
  const cabinH = horizontal ? cabinThick : cabinLen;

  const portholeCount = Math.max(1, size - 2);
  const portholes = Array.from({ length: portholeCount }, (_, i) => {
    const l = portholeCount === 1 ? UNIT * 1.15 : UNIT * 0.9 + (i * (L - UNIT * 1.8)) / (portholeCount - 1);
    const [x, y] = pt(l, T * 0.5).split(",").map(Number);
    return { x, y };
  });

  return (
    <div
      className={`bs-hull ${horizontal ? "bs-hull--h" : "bs-hull--v"} ${draggable ? "bs-hull--draggable" : ""}`}
      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
      title={shipName(size)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <svg viewBox={viewBox} preserveAspectRatio="none" className="bs-hull-svg">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors.deck} />
            <stop offset="100%" stopColor={colors.hull} />
          </linearGradient>
        </defs>
        <path d={hullPath} fill={`url(#${gradId})`} stroke={colors.trim} strokeWidth="0.9" strokeLinejoin="round" />
        <path d={deckPath} fill={colors.deck} opacity="0.5" />
        <rect x={cabinX} y={cabinY} width={cabinW} height={cabinH} rx="1.2" fill={colors.trim} />
        {portholes.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={T * 0.07} fill="#e0f2fe" opacity="0.9" />
        ))}
      </svg>
    </div>
  );
}
