import type { Card } from "./deck";
import { isRedSuit } from "./deck";

export function PlayingCard({
  card,
  highlighted = false,
  faceDown = false,
  onClick,
}: {
  card: Card;
  highlighted?: boolean;
  faceDown?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  if (faceDown) {
    return <Tag className="gf-card gf-card--back" onClick={onClick} aria-label="Face-down card" />;
  }
  const red = isRedSuit(card.suit);
  return (
    <Tag
      className={`gf-card ${red ? "gf-card--red" : "gf-card--black"} ${highlighted ? "gf-card--highlighted" : ""}`}
      onClick={onClick}
    >
      <span className="gf-card__rank">{card.rank}</span>
      <span className="gf-card__suit">{card.suit}</span>
    </Tag>
  );
}
