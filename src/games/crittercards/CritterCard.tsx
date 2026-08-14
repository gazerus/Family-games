import type { CSSProperties } from "react";
import { ANIMAL_EMOJI, type Card, type Color } from "./deck";

const COLOR_HEX: Record<Color, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  green: "#22c55e",
};

const WILD_BG = "conic-gradient(from 45deg, #ef4444, #eab308, #22c55e, #3b82f6, #ef4444)";

function symbolFor(card: Card): string {
  switch (card.kind) {
    case "number":
      return String(card.value);
    case "skip":
      return "⊘";
    case "reverse":
      return "⇄";
    case "draw2":
      return "+2";
    case "wild":
      return "★";
  }
}

export function CritterCard({
  card,
  activeColor,
  dimmed = false,
  onClick,
}: {
  card: Card;
  activeColor?: Color;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const background = card.kind === "wild" ? WILD_BG : COLOR_HEX[card.color!];
  // For a wild card, once a colour is chosen the area inside the white
  // border fills with it while the area outside stays the rainbow base.
  const insetFill = card.kind === "wild" && activeColor ? COLOR_HEX[activeColor] : "transparent";
  const Tag = onClick ? "button" : "div";
  const style = { background } as CSSProperties;
  return (
    <Tag
      className={`critter-card ${dimmed ? "critter-card--dimmed" : ""}`}
      style={style}
      onClick={onClick}
      disabled={onClick ? dimmed : undefined}
    >
      <span className="critter-card__inset" style={{ background: insetFill }} />
      <span className="critter-card__symbol">{symbolFor(card)}</span>
      {card.kind === "number" && card.value != null && (
        <span className="critter-card__animal">{ANIMAL_EMOJI[card.value - 1]}</span>
      )}
    </Tag>
  );
}
