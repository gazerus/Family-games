import { shuffle } from "../shuffle";
import { RANKS, makeDeck, type Card, type Rank } from "../deck";

export interface EnginePlayer {
  sessionId: string;
  name: string;
}

// Value 1..12 (Ace..Queen) is what a centre stack builds through; Kings are
// wild everywhere else so they never occupy a slot of their own here.
const SEQUENCE_VALUE: Partial<Record<Rank, number>> = Object.fromEntries(
  RANKS.filter((r) => r !== "K").map((r, i) => [r, i + 1])
);
const SEQUENCE_LENGTH = 12; // Ace..Queen

export const PAYOFF_SIZE = 20;
export const HAND_SIZE = 5;
const SIDE_STACK_COUNT = 4;
const CENTRE_STACK_COUNT = 3;
const STALL_TURNS_FOR_DRAW = 2; // one full round with zero centre progress

export type PlaySource =
  | { type: "hand"; cardId: number }
  | { type: "side"; stackIdx: number }
  | { type: "payoff" };

export type Phase = "playing" | "game-over";

export interface EngineState {
  phase: Phase;
  players: EnginePlayer[];
  currentPlayerId: string;
  hands: Record<string, Card[]>;
  payoffPiles: Record<string, Card[]>; // last element = top (next playable)
  sideStacks: Record<string, (Card[] | null)[]>; // fixed length SIDE_STACK_COUNT; null = unused slot
  centreStacks: (Card[] | null)[]; // fixed length CENTRE_STACK_COUNT; null = unused slot
  stock: Card[];
  winnerId: string | null; // null = draw (only meaningful at game-over)
  centrePlaysThisTurn: number;
  stallStreak: number;
  lastEventText: string | null;
}

function isWild(card: Card): boolean {
  return card.rank === "K";
}

function centreStackValue(stack: Card[] | null): number {
  return stack ? stack.length : 0;
}

// A card is legal on a centre stack if it's an exact one-higher sequence
// card (or a King filling in for whatever's needed), and a fresh (null)
// stack can only be opened with an Ace or a King standing in for one.
export function canPlayToCentreStack(card: Card, stack: Card[] | null): boolean {
  const needed = centreStackValue(stack) + 1;
  if (isWild(card)) return needed <= SEQUENCE_LENGTH;
  return SEQUENCE_VALUE[card.rank] === needed;
}

function playerName(state: EngineState, id: string): string {
  return state.players.find((p) => p.sessionId === id)?.name ?? "Someone";
}

function otherPlayer(state: EngineState, id: string): string | null {
  return state.players.find((p) => p.sessionId !== id)?.sessionId ?? null;
}

function refillHand(state: EngineState, playerId: string): EngineState {
  const hand = state.hands[playerId];
  if (hand.length >= HAND_SIZE || state.stock.length === 0) return state;
  const need = HAND_SIZE - hand.length;
  const drawn = state.stock.slice(0, need);
  return {
    ...state,
    stock: state.stock.slice(need),
    hands: { ...state.hands, [playerId]: [...hand, ...drawn] },
  };
}

export function dealNewGame(players: EnginePlayer[]): EngineState {
  const deck = shuffle(makeDeck(2));
  const payoffPiles: Record<string, Card[]> = {};
  const hands: Record<string, Card[]> = {};
  const sideStacks: Record<string, (Card[] | null)[]> = {};
  for (const p of players) {
    payoffPiles[p.sessionId] = deck.splice(0, PAYOFF_SIZE);
    hands[p.sessionId] = deck.splice(0, HAND_SIZE);
    sideStacks[p.sessionId] = Array.from({ length: SIDE_STACK_COUNT }, () => null);
  }
  return {
    phase: "playing",
    players,
    currentPlayerId: players[0].sessionId,
    hands,
    payoffPiles,
    sideStacks,
    centreStacks: Array.from({ length: CENTRE_STACK_COUNT }, () => null),
    stock: deck,
    winnerId: null,
    centrePlaysThisTurn: 0,
    stallStreak: 0,
    lastEventText: null,
  };
}

// Removes and returns the sourced card, along with the state it leaves
// behind — or null if that source doesn't actually have a playable card
// (e.g. an empty side-stack slot, someone else's turn already validated
// elsewhere). Does not check destination legality.
function takeFromSource(
  state: EngineState,
  playerId: string,
  source: PlaySource
): { card: Card; state: EngineState } | null {
  if (source.type === "hand") {
    const hand = state.hands[playerId];
    const card = hand.find((c) => c.id === source.cardId);
    if (!card) return null;
    return { card, state: { ...state, hands: { ...state.hands, [playerId]: hand.filter((c) => c.id !== card.id) } } };
  }
  if (source.type === "payoff") {
    const pile = state.payoffPiles[playerId];
    if (pile.length === 0) return null;
    const card = pile[pile.length - 1];
    return { card, state: { ...state, payoffPiles: { ...state.payoffPiles, [playerId]: pile.slice(0, -1) } } };
  }
  const stacks = state.sideStacks[playerId];
  const stack = stacks[source.stackIdx];
  if (!stack || stack.length === 0) return null;
  const card = stack[stack.length - 1];
  const nextStack = stack.slice(0, -1);
  const nextStacks = [...stacks];
  nextStacks[source.stackIdx] = nextStack.length > 0 ? nextStack : null;
  return { card, state: { ...state, sideStacks: { ...state.sideStacks, [playerId]: nextStacks } } };
}

function checkWin(state: EngineState, playerId: string, source: PlaySource): EngineState {
  if (source.type === "payoff" && state.payoffPiles[playerId].length === 0) {
    return { ...state, phase: "game-over", winnerId: playerId };
  }
  return state;
}

export function applyPlayToCentre(
  state: EngineState,
  playerId: string,
  source: PlaySource,
  centreIdx: number
): EngineState {
  if (state.phase !== "playing" || state.currentPlayerId !== playerId) return state;
  if (centreIdx < 0 || centreIdx >= state.centreStacks.length) return state;
  const taken = takeFromSource(state, playerId, source);
  if (!taken) return state;
  const { card } = taken;
  let s = taken.state;
  const targetStack = s.centreStacks[centreIdx];
  if (!canPlayToCentreStack(card, targetStack)) return state;

  const nextStack = [...(targetStack ?? []), card];
  const centreStacks = [...s.centreStacks];
  let eventSuffix = "";
  if (nextStack.length === SEQUENCE_LENGTH) {
    // Completed through Queen — clear it back into the stock (shuffled)
    // and free the slot for a new stack.
    centreStacks[centreIdx] = null;
    s = { ...s, stock: shuffle([...s.stock, ...nextStack]) };
    eventSuffix = " — completed a stack!";
  } else {
    centreStacks[centreIdx] = nextStack;
  }
  s = { ...s, centreStacks, centrePlaysThisTurn: s.centrePlaysThisTurn + 1, stallStreak: 0 };

  s = checkWin(s, playerId, source);
  if (s.phase === "game-over") {
    return { ...s, lastEventText: `${playerName(s, playerId)} played their last payoff card and wins!` };
  }

  if (source.type === "hand" && s.hands[playerId].length === 0) {
    s = refillHand(s, playerId);
  }

  return { ...s, lastEventText: `${playerName(s, playerId)} played ${card.rank}${card.suit}${eventSuffix}` };
}

/**
 * Hands control to the other player. Shared by the normal way a turn ends
 * (discarding from hand) and the rare case where there's nothing left to
 * discard with — see applyEndTurn.
 */
function passTurn(state: EngineState, playerId: string, eventText: string): EngineState {
  // Hand tops up first (per-turn refill), then it's the stall check — did a
  // whole trip round the table pass with no centre progress while the stock
  // is dry? — before handing control across.
  const nextPlayerId = otherPlayer(state, playerId) ?? playerId;
  // A "stalled" turn is one that made zero centre-stack progress while the
  // stock had nothing left to offer; two of those in a row (one full trip
  // round the table) means nobody can move the game forward any more.
  const stalledThisTurn = state.centrePlaysThisTurn === 0 && state.stock.length === 0;
  const stallStreak = stalledThisTurn ? state.stallStreak + 1 : 0;

  if (stallStreak >= STALL_TURNS_FOR_DRAW) {
    return { ...state, phase: "game-over", winnerId: null, lastEventText: "Stock's out and nobody can move — it's a draw." };
  }

  const s = refillHand(state, nextPlayerId);
  return {
    ...s,
    currentPlayerId: nextPlayerId,
    centrePlaysThisTurn: 0,
    stallStreak,
    lastEventText: eventText,
  };
}

export function applyPlayToSide(
  state: EngineState,
  playerId: string,
  source: PlaySource,
  sideIdx: number
): EngineState {
  if (state.phase !== "playing" || state.currentPlayerId !== playerId) return state;
  // Only a card from your hand can be discarded. The pay-off card is the one
  // you're racing to get rid of — letting it go to a side stack would both
  // skip the centre stacks it has to be played on and (via checkWin) hand
  // someone the game for dumping their last one. Side-to-side isn't a move
  // either.
  if (source.type !== "hand") return state;
  if (sideIdx < 0 || sideIdx >= SIDE_STACK_COUNT) return state;
  const taken = takeFromSource(state, playerId, source);
  if (!taken) return state;
  const { card } = taken;
  const s = taken.state;

  const stacks = s.sideStacks[playerId];
  const nextStacks = [...stacks];
  nextStacks[sideIdx] = [...(stacks[sideIdx] ?? []), card];

  return passTurn(
    { ...s, sideStacks: { ...s.sideStacks, [playerId]: nextStacks } },
    playerId,
    `${playerName(s, playerId)} discarded ${card.rank}${card.suit} to a side stack.`
  );
}

/**
 * A turn normally ends by discarding from your hand. If you've played your
 * whole hand to the centre and the stock is empty there's nothing left to
 * discard, so the turn has to be able to end without one — otherwise the
 * game freezes with no legal move for anybody.
 */
export function canEndTurnWithoutDiscard(state: EngineState, playerId: string): boolean {
  if (state.phase !== "playing" || state.currentPlayerId !== playerId) return false;
  return state.hands[playerId].length === 0 && state.stock.length === 0;
}

export function applyEndTurn(state: EngineState, playerId: string): EngineState {
  if (!canEndTurnWithoutDiscard(state, playerId)) return state;
  return passTurn(state, playerId, `${playerName(state, playerId)} had nothing left to discard.`);
}
