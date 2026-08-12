import { shuffle } from "../shuffle";

export type Color = "red" | "blue" | "yellow" | "green";
export type CardKind = "number" | "skip" | "reverse" | "draw2" | "wild";

export interface Card {
  id: number;
  kind: CardKind;
  color: Color | null;
  value?: number;
}

export const COLORS: Color[] = ["red", "blue", "yellow", "green"];
export const HAND_SIZE = 5;

export const ANIMAL_EMOJI = ["🐘", "🦁", "🐵", "🐸", "🐰", "🐻", "🦒", "🐯", "🐼"];

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (const color of COLORS) {
    for (let value = 1; value <= 9; value++) deck.push({ id: id++, kind: "number", color, value });
    deck.push({ id: id++, kind: "skip", color });
    deck.push({ id: id++, kind: "reverse", color });
    deck.push({ id: id++, kind: "draw2", color });
  }
  for (let i = 0; i < 4; i++) deck.push({ id: id++, kind: "wild", color: null });
  return shuffle(deck);
}

export function cardMatches(card: Card, activeColor: Color, topCard: Card): boolean {
  if (card.kind === "wild") return true;
  if (card.color === activeColor) return true;
  if (card.kind === "number" && topCard.kind === "number" && card.value === topCard.value) return true;
  // Action cards (Skip, Reverse, Draw 2) match on kind too, same color or
  // not — a Reverse can always answer a Reverse, a Skip can always answer
  // a Skip, regardless of color.
  return card.kind !== "number" && card.kind === topCard.kind;
}
