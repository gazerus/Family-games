// Dot positions for a standard die face, as [row, col] on a 3x3 grid.
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

export function Pips({ value, className }: { value: number; className?: string }) {
  const layout = PIP_LAYOUTS[value] ?? [];
  return (
    <span className={`pips ${className ?? ""}`}>
      {layout.map(([row, col]) => (
        <span
          key={`${row}-${col}`}
          className="pips__dot"
          style={{ gridRow: row + 1, gridColumn: col + 1 }}
        />
      ))}
    </span>
  );
}
