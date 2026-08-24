import { useEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { colorForPlayerIndex } from "../playerColors";
import { PlayingCard } from "./PlayingCard";
import type { Card, Rank } from "./deck";
import {
  applyAsk,
  applyRespond,
  dealNewGame,
  rankPlural,
  type Book,
  type EnginePlayer,
  type EngineState,
  type Phase,
} from "./engine";

const GAME_ID = "go-fish";

interface FeedEvent {
  id: string;
  text: string;
}

interface PublicState {
  phase: Phase;
  hostId: string;
  players: EnginePlayer[];
  currentPlayerId: string;
  handCounts: Record<string, number>;
  stockCount: number;
  books: Book[];
  winnerId: string | null;
  pendingRank: Rank | null;
  lastEvent: FeedEvent | null;
}

interface HandPayload {
  hand: Card[];
}

interface AskPayload {
  rank: Rank;
}

interface RespondPayload {
  handOver: boolean;
}

type GoFishPayload = PublicState | HandPayload | AskPayload | RespondPayload | Record<string, never>;

function publicStateFrom(engine: EngineState, hostId: string): PublicState {
  return {
    phase: engine.phase,
    hostId,
    players: engine.players,
    currentPlayerId: engine.currentPlayerId,
    handCounts: Object.fromEntries(engine.players.map((p) => [p.sessionId, engine.hands[p.sessionId].length])),
    stockCount: engine.stock.length,
    books: engine.books,
    winnerId: engine.winnerId,
    pendingRank: engine.pendingRank,
    lastEvent: engine.lastEventText ? { id: `${Date.now()}-${Math.random()}`, text: engine.lastEventText } : null,
  };
}

export function GoFishGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, GoFishPayload>(GAME_ID, "game-over");

  const [myHand, setMyHand] = useState<Card[]>([]);
  const engineRef = useRef<EngineState | null>(null);

  function sendHand(playerId: string, hand: Card[]) {
    if (playerId === localSessionId) setMyHand(hand);
    else send("hand", { hand }, playerId);
  }

  // The one place a host-side engine transition gets turned into network
  // traffic: each player's own hand goes out privately, and everything
  // else (counts, books, whose turn) goes out as the public broadcast.
  function commit(engine: EngineState) {
    engineRef.current = engine;
    for (const p of engine.players) sendHand(p.sessionId, engine.hands[p.sessionId]);
    updateState(publicStateFrom(engine, localSessionId ?? ""));
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type === "hand") {
        setMyHand((payload as HandPayload).hand);
        return;
      }
      if (!isHost || !engineRef.current) return;
      if (type === "request-state") {
        const hand = engineRef.current.hands[senderId];
        if (hand) sendHand(senderId, hand);
        return;
      }
      if (type === "ask") {
        commit(applyAsk(engineRef.current, senderId, (payload as AskPayload).rank));
        return;
      }
      if (type === "respond") {
        commit(applyRespond(engineRef.current, senderId, (payload as RespondPayload).handOver));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost]);

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    const engine = dealNewGame(order);
    engineRef.current = engine;
    for (const p of order) sendHand(p.sessionId, engine.hands[p.sessionId]);
    startAsHost(publicStateFrom(engine, localSessionId ?? ""));
  }

  function handleAsk(rank: Rank) {
    if (!state) return;
    if (isHost && engineRef.current) commit(applyAsk(engineRef.current, localSessionId ?? "", rank));
    else send("ask", { rank });
  }

  function handleRespond(handOver: boolean) {
    if (!state) return;
    if (isHost && engineRef.current) commit(applyRespond(engineRef.current, localSessionId ?? "", handOver));
    else send("respond", { handOver });
  }

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🎣 Go Fish</h2>
        <p>
          Ask for a rank you're holding. If they have it, it's honour system — they can hand it over or
          bluff and say "Go Fish!"
        </p>
        {presentPlayers.length < 2 ? (
          <p className="dg-hint">Need at least 2 people to have this game open.</p>
        ) : (
          <p className="dg-hint">
            {presentPlayers.length} people ready. Whoever starts runs the first game.
          </p>
        )}
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
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
        <h2>{winner ? `🏆 ${winner.name} wins!` : "🤝 It's a tie!"}</h2>
        <p className="dg-hint">
          {state.players
            .map((p) => `${p.name}: ${state.books.filter((b) => b.ownerId === p.sessionId).length} books`)
            .join(" · ")}
        </p>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const myIdx = state.players.findIndex((p) => p.sessionId === localSessionId);
  const opponent = state.players.find((p) => p.sessionId !== localSessionId);
  const opponentIdx = state.players.findIndex((p) => p.sessionId === opponent?.sessionId);
  const isAsker = state.currentPlayerId === localSessionId;
  const isTarget = state.phase === "responding" && !isAsker;
  const myMatches = state.pendingRank ? myHand.filter((c) => c.rank === state.pendingRank).length : 0;

  return (
    <div className="go-fish-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="gf-turn-banner">
          {state.phase === "responding"
            ? isTarget
              ? `${state.players.find((p) => p.sessionId === state.currentPlayerId)?.name} wants your ${rankPlural(state.pendingRank!)}!`
              : `Waiting for ${opponent?.name}…`
            : isAsker
              ? "Your turn — tap a card to ask for its rank"
              : `${opponent?.name}'s turn`}
        </div>
      </div>

      {state.lastEvent && (
        <div className="gf-feed" key={state.lastEvent.id}>
          {state.lastEvent.text}
        </div>
      )}

      <div className="gf-scoreboard">
        <span className="dom-opponent-chip" style={{ color: colorForPlayerIndex(myIdx) }}>
          You: {state.books.filter((b) => b.ownerId === localSessionId).length} books
        </span>
        {opponent && (
          <span className="dom-opponent-chip" style={{ color: colorForPlayerIndex(opponentIdx) }}>
            {opponent.name}: {state.books.filter((b) => b.ownerId === opponent.sessionId).length} books
          </span>
        )}
        <span className="dom-opponent-chip">🂠 Stock: {state.stockCount}</span>
      </div>

      <div className="gf-opponent-hand">
        {Array.from({ length: opponent ? state.handCounts[opponent.sessionId] ?? 0 : 0 }, (_, i) => (
          <PlayingCard key={i} card={{ id: i, rank: "A", suit: "♠" }} faceDown />
        ))}
      </div>

      <div className="gf-board">
        {isTarget && (
          <div className="gf-respond-panel">
            <p className="gf-hint">
              {myMatches > 0
                ? "It's up to you — nobody's checking your hand."
                : "You don't have any — you can only say Go Fish."}
            </p>
            <div className="gf-respond-actions">
              {myMatches > 0 && (
                <button className="primary-button" onClick={() => handleRespond(true)}>
                  🤝 Hand them over ({myMatches})
                </button>
              )}
              <button className="link-button" onClick={() => handleRespond(false)}>
                🎣 Go Fish!
              </button>
            </div>
          </div>
        )}
        {state.phase === "responding" && !isTarget && <p className="gf-hint">Waiting to hear back…</p>}
        {state.books.length > 0 && (
          <div className="gf-books">
            {state.books.map((b, i) => {
              const idx = state.players.findIndex((p) => p.sessionId === b.ownerId);
              return (
                <span key={i} className="gf-book-chip" style={{ color: colorForPlayerIndex(idx) }}>
                  {b.rank}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="gf-my-hand">
        {myHand.map((card) => {
          const canAsk = state.phase === "asking" && isAsker;
          const highlighted = isTarget && state.pendingRank === card.rank;
          return (
            <PlayingCard
              key={card.id}
              card={card}
              highlighted={highlighted}
              onClick={canAsk ? () => handleAsk(card.rank) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
