import { shuffle } from "../shuffle";
import { RANKS, makeDeck, type Card, type Rank } from "../deck";

const HAND_SIZE = 7;

export interface EnginePlayer {
  sessionId: string;
  name: string;
}

export interface Book {
  rank: Rank;
  ownerId: string;
}

export type Phase = "asking" | "responding" | "game-over";

export interface EngineState {
  phase: Phase;
  players: EnginePlayer[];
  currentPlayerId: string; // the asker, for the whole asking+responding cycle
  hands: Record<string, Card[]>;
  stock: Card[];
  books: Book[];
  winnerId: string | null; // null = draw (only meaningful at game-over)
  pendingRank: Rank | null; // set while phase === "responding"
  lastEventText: string | null;
}

export function rankPlural(rank: Rank): string {
  if (rank === "A") return "Aces";
  if (rank === "K") return "Kings";
  if (rank === "Q") return "Queens";
  if (rank === "J") return "Jacks";
  return `${rank}s`;
}

// Pulls out any completed 4-of-a-kind books, returning what's left.
function extractBooks(hand: Card[]): { hand: Card[]; completedRanks: Rank[] } {
  const completed: Rank[] = [];
  for (const rank of RANKS) {
    if (hand.filter((c) => c.rank === rank).length === 4) completed.push(rank);
  }
  const completedSet = new Set(completed);
  return { hand: hand.filter((c) => !completedSet.has(c.rank)), completedRanks: completed };
}

function otherPlayer(state: EngineState, id: string): string | null {
  return state.players.find((p) => p.sessionId !== id)?.sessionId ?? null;
}

function playerName(state: EngineState, id: string): string {
  return state.players.find((p) => p.sessionId === id)?.name ?? "Someone";
}

function gain(state: EngineState, playerId: string, cards: Card[]): EngineState {
  const merged = [...state.hands[playerId], ...cards];
  const { hand, completedRanks } = extractBooks(merged);
  const books = [...state.books, ...completedRanks.map((rank) => ({ rank, ownerId: playerId }))];
  return { ...state, hands: { ...state.hands, [playerId]: hand }, books };
}

// Whoever's turn is starting refills to a full hand if theirs is empty
// (drawing straight from the stock); if there's nothing left to draw
// either, the game is over right here — books decide the winner, or it's
// a draw if tied.
function startTurn(state: EngineState, playerId: string): EngineState {
  let s = state;
  if (s.hands[playerId].length === 0 && s.stock.length > 0) {
    const [drawn, ...rest] = s.stock;
    s = { ...s, stock: rest, hands: { ...s.hands, [playerId]: [...s.hands[playerId], drawn] } };
  }
  if (s.hands[playerId].length === 0 && s.stock.length === 0) {
    const otherId = otherPlayer(s, playerId);
    const myBooks = s.books.filter((b) => b.ownerId === playerId).length;
    const otherBooks = otherId ? s.books.filter((b) => b.ownerId === otherId).length : 0;
    const winnerId = myBooks === otherBooks ? null : myBooks > otherBooks ? playerId : otherId;
    return { ...s, phase: "game-over", winnerId, pendingRank: null };
  }
  return { ...s, phase: "asking", currentPlayerId: playerId, pendingRank: null };
}

export function dealNewGame(players: EnginePlayer[]): EngineState {
  const deck = shuffle(makeDeck());
  const hands: Record<string, Card[]> = {};
  for (const p of players) hands[p.sessionId] = deck.splice(0, HAND_SIZE);
  return {
    phase: "asking",
    players,
    currentPlayerId: players[0].sessionId,
    hands,
    stock: deck,
    books: [],
    winnerId: null,
    pendingRank: null,
    lastEventText: null,
  };
}

export function applyAsk(state: EngineState, senderId: string, rank: Rank): EngineState {
  if (state.phase !== "asking" || state.currentPlayerId !== senderId) return state;
  if (!state.hands[senderId].some((c) => c.rank === rank)) return state;
  return {
    ...state,
    phase: "responding",
    pendingRank: rank,
    lastEventText: `${playerName(state, senderId)} asked for ${rankPlural(rank)}`,
  };
}

// `handOver` is the target's own choice — the engine never checks it
// against the truth beyond "do they actually have any to hand over", so a
// target with matches can still legitimately choose to bluff and say Go
// Fish instead. That's the point, not a bug.
export function applyRespond(state: EngineState, senderId: string, handOver: boolean): EngineState {
  if (state.phase !== "responding" || senderId === state.currentPlayerId) return state;
  const askerId = state.currentPlayerId;
  const rank = state.pendingRank;
  if (!rank) return state;
  const targetId = senderId;
  const targetName = playerName(state, targetId);
  const askerName = playerName(state, askerId);
  const matches = state.hands[targetId].filter((c) => c.rank === rank);

  if (handOver && matches.length > 0) {
    let s: EngineState = {
      ...state,
      hands: { ...state.hands, [targetId]: state.hands[targetId].filter((c) => c.rank !== rank) },
    };
    s = gain(s, askerId, matches);
    s = startTurn(s, askerId);
    return {
      ...s,
      lastEventText: `${targetName} handed over ${matches.length} ${rankPlural(rank)}! ${askerName} goes again.`,
    };
  }

  const drawn = state.stock[0];
  let s: EngineState = drawn ? { ...state, stock: state.stock.slice(1) } : state;
  let matchedDraw = false;
  if (drawn) {
    s = gain(s, askerId, [drawn]);
    matchedDraw = drawn.rank === rank;
  }
  const nextPlayerId = matchedDraw ? askerId : targetId;
  s = startTurn(s, nextPlayerId);
  return {
    ...s,
    lastEventText: matchedDraw
      ? `${targetName} said "Go Fish!" — ${askerName} drew a match and goes again!`
      : `${targetName} said "Go Fish!"`,
  };
}
