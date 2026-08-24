export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export type Suit = (typeof SUITS)[number];

export interface Card {
  id: number;
  rank: Rank;
  suit: Suit;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "♥" || suit === "♦";
}

/** One or more standard 52-card decks merged, with globally-unique ids. */
export function makeDeck(packs = 1): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (let pack = 0; pack < packs; pack++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: id++, rank, suit });
      }
    }
  }
  return deck;
}
