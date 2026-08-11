import { Pips } from "../../components/Pips";

export function DominoTile({
  a,
  b,
  dimmed = false,
  onClick,
}: {
  a: number;
  b: number;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`domino ${a === b ? "domino--double" : ""} ${dimmed ? "domino--dimmed" : ""}`}
      onClick={onClick}
      disabled={onClick ? dimmed : undefined}
    >
      <span className="domino__half">
        <Pips value={a} />
      </span>
      <span className="domino__divider" />
      <span className="domino__half">
        <Pips value={b} />
      </span>
    </Tag>
  );
}
