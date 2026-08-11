import { useEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { CritterCard } from "./CritterCard";
import { shuffle } from "../shuffle";
import { COLORS, HAND_SIZE, cardMatches, makeDeck, type Card, type Color } from "./deck";

const GAME_ID = "critter-cards";

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: "playing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  handCounts: Record<string, number>;
  topCard: Card;
  activeColor: Color;
  direction: 1 | -1;
  currentPlayerId: string;
  winnerId: string | null;
  drawPileCount: number;
}

interface HandPayload {
  hand: Card[];
}

interface PlayPayload {
  cardId: number;
  chosenColor?: Color;
}

type CritterPayload = PublicState | HandPayload | PlayPayload | Record<string, never>;

export function CritterCardsGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    participants,
  } = useHostGameState<PublicState, CritterPayload>(GAME_ID, "game-over");

  const [myHand, setMyHand] = useState<Card[]>([]);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);
  const handsRef = useRef<Record<string, Card[]>>({});
  const drawPileRef = useRef<Card[]>([]);
  const discardRef = useRef<Card[]>([]);

  function sendHand(playerId: string, hand: Card[]) {
    if (playerId === localSessionId) setMyHand(hand);
    else send("hand", { hand }, playerId);
  }

  function drawCards(n: number): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < n; i++) {
      if (drawPileRef.current.length === 0) {
        if (discardRef.current.length <= 1) break;
        const top = discardRef.current[discardRef.current.length - 1];
        drawPileRef.current = shuffle(discardRef.current.slice(0, -1));
        discardRef.current = [top];
      }
      const card = drawPileRef.current.pop();
      if (!card) break;
      drawn.push(card);
    }
    return drawn;
  }

  function applyPlay(current: PublicState, senderId: string, cardId: number, chosenColor?: Color) {
    if (current.phase !== "playing" || current.currentPlayerId !== senderId) return;
    const hand = handsRef.current[senderId] ?? [];
    const card = hand.find((c) => c.id === cardId);
    if (!card) return;
    if (!cardMatches(card, current.activeColor, current.topCard)) return;
    if (card.kind === "wild" && !chosenColor) return;

    handsRef.current[senderId] = hand.filter((c) => c.id !== cardId);
    discardRef.current.push(card);
    sendHand(senderId, handsRef.current[senderId]);

    const handCounts = { ...current.handCounts, [senderId]: handsRef.current[senderId].length };
    const activeColor = card.kind === "wild" ? chosenColor! : card.color!;

    if (handsRef.current[senderId].length === 0) {
      updateState({ ...current, topCard: card, activeColor, handCounts, phase: "game-over", winnerId: senderId });
      return;
    }

    let direction = current.direction;
    let skipCount = 1;
    const n = current.players.length;
    const idx = current.players.findIndex((p) => p.sessionId === senderId);

    if (card.kind === "reverse") {
      if (n === 2) {
        skipCount = 2;
      } else {
        direction = (direction * -1) as 1 | -1;
        skipCount = 1;
      }
    } else if (card.kind === "skip") {
      skipCount = 2;
    } else if (card.kind === "draw2") {
      const victim = current.players[((idx + direction) % n + n) % n];
      const drawn = drawCards(2);
      handsRef.current[victim.sessionId] = [...(handsRef.current[victim.sessionId] ?? []), ...drawn];
      sendHand(victim.sessionId, handsRef.current[victim.sessionId]);
      handCounts[victim.sessionId] = handsRef.current[victim.sessionId].length;
      skipCount = 2;
    }

    const nextIdx = ((idx + skipCount * direction) % n + n) % n;

    updateState({
      ...current,
      topCard: card,
      activeColor,
      direction,
      handCounts,
      currentPlayerId: current.players[nextIdx].sessionId,
      drawPileCount: drawPileRef.current.length,
    });
  }

  function applyDraw(current: PublicState, senderId: string) {
    if (current.phase !== "playing" || current.currentPlayerId !== senderId) return;
    const drawn = drawCards(1);
    if (drawn.length === 0) return;
    handsRef.current[senderId] = [...(handsRef.current[senderId] ?? []), ...drawn];
    sendHand(senderId, handsRef.current[senderId]);
    updateState({
      ...current,
      handCounts: { ...current.handCounts, [senderId]: handsRef.current[senderId].length },
      drawPileCount: drawPileRef.current.length,
    });
  }

  function applyPass(current: PublicState, senderId: string) {
    if (current.phase !== "playing" || current.currentPlayerId !== senderId) return;
    const hand = handsRef.current[senderId] ?? [];
    const canPlay = hand.some((c) => cardMatches(c, current.activeColor, current.topCard));
    if (canPlay) return;
    const n = current.players.length;
    const idx = current.players.findIndex((p) => p.sessionId === senderId);
    const nextIdx = ((idx + current.direction) % n + n) % n;
    updateState({ ...current, currentPlayerId: current.players[nextIdx].sessionId });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type === "hand") {
        setMyHand((payload as HandPayload).hand);
        return;
      }
      if (!isHost || !state) return;
      if (type === "request-state") {
        // The generic host-state resync doesn't know about per-player secret
        // hands; re-send the requester's own hand so a reopened game screen
        // doesn't show them an empty hand.
        if (handsRef.current[senderId]) sendHand(senderId, handsRef.current[senderId]);
        return;
      }
      if (type === "play") {
        const { cardId, chosenColor } = payload as PlayPayload;
        applyPlay(state, senderId, cardId, chosenColor);
      } else if (type === "draw") {
        applyDraw(state, senderId);
      } else if (type === "pass") {
        applyPass(state, senderId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function startGame() {
    const order = participants.map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;

    const deck = makeDeck();
    const hands: Record<string, Card[]> = {};
    for (const p of order) hands[p.sessionId] = deck.splice(0, HAND_SIZE);
    handsRef.current = hands;
    const topCard = deck.shift()!;
    discardRef.current = [topCard];
    drawPileRef.current = deck;

    startAsHost({
      phase: "playing",
      hostId: localSessionId ?? "",
      players: order,
      handCounts: Object.fromEntries(order.map((p) => [p.sessionId, hands[p.sessionId].length])),
      topCard,
      activeColor: topCard.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
      direction: 1,
      currentPlayerId: order[0].sessionId,
      winnerId: null,
      drawPileCount: drawPileRef.current.length,
    });
    for (const p of order) sendHand(p.sessionId, hands[p.sessionId]);
    setPendingWildCard(null);
  }

  function handleCardTap(card: Card) {
    if (!state || state.currentPlayerId !== localSessionId) return;
    if (!cardMatches(card, state.activeColor, state.topCard)) return;
    if (card.kind === "wild") {
      setPendingWildCard(card);
      return;
    }
    playCard(card);
  }

  function playCard(card: Card, chosenColor?: Color) {
    if (!state) return;
    if (isHost) applyPlay(state, localSessionId ?? "", card.id, chosenColor);
    else send("play", { cardId: card.id, chosenColor });
    setPendingWildCard(null);
  }

  function handleDraw() {
    if (!state) return;
    if (isHost) applyDraw(state, localSessionId ?? "");
    else send("draw", {});
  }

  function handlePass() {
    if (!state) return;
    if (isHost) applyPass(state, localSessionId ?? "");
    else send("pass", {});
  }

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🐾 Critter Cards</h2>
        <p>Match by color or number. Skip, Reverse, and Draw 2 mix things up. First to empty their hand wins.</p>
        {participants.length < 2 ? (
          <p className="dg-hint">Need at least 2 people in the room to play.</p>
        ) : (
          <p className="dg-hint">
            {participants.length} people ready. Whoever starts runs the first game.
          </p>
        )}
        <button className="primary-button" onClick={startGame} disabled={participants.length < 2}>
          Start game
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (state.phase === "game-over") {
    const winner = state.players.find((p) => p.sessionId === state.winnerId);
    return (
      <div className="dg-lobby">
        <h2>🏆 {winner?.name ?? "Someone"} wins!</h2>
        <button className="primary-button" onClick={startGame} disabled={participants.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const myTurn = state.currentPlayerId === localSessionId;
  const currentPlayer = state.players.find((p) => p.sessionId === state.currentPlayerId);
  const canPlayNow = myTurn && myHand.some((c) => cardMatches(c, state.activeColor, state.topCard));
  const opponents = state.players.filter((p) => p.sessionId !== localSessionId);

  return (
    <div className="critter-cards-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="cc-turn-banner">{myTurn ? "Your turn" : `${currentPlayer?.name}'s turn`}</div>
      </div>

      <div className="cc-opponents">
        {opponents.map((p) => (
          <span key={p.sessionId} className="dom-opponent-chip">
            {p.name}: {state.handCounts[p.sessionId] ?? 0} 🂠
          </span>
        ))}
        <span className="dom-opponent-chip">Deck: {state.drawPileCount} 🂠</span>
      </div>

      <div className="cc-table">
        <CritterCard card={state.topCard} activeColor={state.activeColor} />
      </div>

      {pendingWildCard && (
        <div className="cc-color-picker">
          <span>Pick a color:</span>
          {COLORS.map((c) => (
            <button key={c} className={`cc-color-swatch cc-color-swatch--${c}`} onClick={() => playCard(pendingWildCard, c)} />
          ))}
          <button className="link-button" onClick={() => setPendingWildCard(null)}>
            Cancel
          </button>
        </div>
      )}

      <div className="cc-hand">
        {myHand.map((c) => (
          <CritterCard
            key={c.id}
            card={c}
            dimmed={!myTurn || !cardMatches(c, state.activeColor, state.topCard)}
            onClick={() => handleCardTap(c)}
          />
        ))}
      </div>

      {myTurn && !canPlayNow && (
        <div className="dom-actions">
          <button className="primary-button" onClick={handleDraw}>
            Draw a card
          </button>
          <button className="link-button" onClick={handlePass}>
            Pass
          </button>
        </div>
      )}
    </div>
  );
}
