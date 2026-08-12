import { useEffect, useMemo, useRef } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { pickSymbols, shuffle } from "./symbols";
import { colorForPlayerIndex } from "../playerColors";

const GAME_ID = "memory-match";
const PAIR_COUNT = 10;
const RESOLVE_PAUSE_MS = 1000;

interface Card {
  id: number;
  symbol: string;
  matched: boolean;
}

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: "playing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  scores: Record<string, number>;
  cards: Card[];
  flippedIds: number[];
  currentPlayerId: string;
}

interface FlipPayload {
  cardId: number;
}

type MemoryPayload = PublicState | FlipPayload;

export function MemoryMatchGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, MemoryPayload>(GAME_ID, "game-over");

  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyFlip(current: PublicState, cardId: number) {
    const card = current.cards.find((c) => c.id === cardId);
    if (!card || card.matched || current.flippedIds.includes(cardId)) return;
    if (current.flippedIds.length >= 2) return;

    const flippedIds = [...current.flippedIds, cardId];
    updateState({ ...current, flippedIds });
    if (flippedIds.length < 2) return;

    const [aId, bId] = flippedIds;
    const a = current.cards.find((c) => c.id === aId)!;
    const b = current.cards.find((c) => c.id === bId)!;
    const isMatch = a.symbol === b.symbol;

    if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current);
    resolveTimeoutRef.current = setTimeout(() => {
      if (isMatch) {
        const cards = current.cards.map((c) =>
          c.id === aId || c.id === bId ? { ...c, matched: true } : c
        );
        const scores = {
          ...current.scores,
          [current.currentPlayerId]: (current.scores[current.currentPlayerId] ?? 0) + 1,
        };
        const allMatched = cards.every((c) => c.matched);
        updateState({
          ...current,
          cards,
          scores,
          flippedIds: [],
          phase: allMatched ? "game-over" : "playing",
        });
      } else {
        const idx = current.players.findIndex((p) => p.sessionId === current.currentPlayerId);
        const next = current.players[(idx + 1) % current.players.length];
        updateState({ ...current, flippedIds: [], currentPlayerId: next.sessionId });
      }
    }, RESOLVE_PAUSE_MS);
  }

  function startGame() {
    const order = presentPlayers.map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    const symbols = pickSymbols(PAIR_COUNT);
    const cards = shuffle([...symbols, ...symbols]).map((symbol, id) => ({
      id,
      symbol,
      matched: false,
    }));
    startAsHost({
      phase: "playing",
      hostId: localSessionId ?? "",
      players: order,
      scores: Object.fromEntries(order.map((p) => [p.sessionId, 0])),
      cards,
      flippedIds: [],
      currentPlayerId: order[0].sessionId,
    });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type !== "flip" || !isHost || !state || state.phase !== "playing") return;
      if (state.currentPlayerId !== senderId) return;
      applyFlip(state, (payload as FlipPayload).cardId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  useEffect(() => () => {
    if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current);
  }, []);

  function handleCardClick(cardId: number) {
    if (!state || state.phase !== "playing") return;
    if (state.currentPlayerId !== localSessionId) return;
    const card = state.cards.find((c) => c.id === cardId);
    if (!card || card.matched || state.flippedIds.includes(cardId)) return;
    if (state.flippedIds.length >= 2) return;
    if (isHost) {
      applyFlip(state, cardId);
    } else {
      send("flip", { cardId });
    }
  }

  const scoreboard = useMemo(() => {
    if (!state) return [];
    return state.players
      .map((p, i) => ({ ...p, score: state.scores[p.sessionId] ?? 0, color: colorForPlayerIndex(i) }))
      .sort((a, b) => b.score - a.score);
  }, [state]);

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🧠 Memory Match</h2>
        <p>Flip cards to find matching pairs. Most pairs wins.</p>
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
    const winner = scoreboard[0];
    const isTie = scoreboard.length > 1 && scoreboard[1].score === winner.score;
    return (
      <div className="dg-lobby">
        <h2>🏆 {isTie ? "It's a tie!" : `${winner.name} wins!`}</h2>
        <ol className="dg-scoreboard">
          {scoreboard.map((p) => (
            <li key={p.sessionId}>
              <span style={{ color: p.color, fontWeight: 700 }}>{p.name}</span>
              <span>{p.score} pair{p.score === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ol>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const currentPlayerIndex = state.players.findIndex((p) => p.sessionId === state.currentPlayerId);
  const currentPlayer = state.players[currentPlayerIndex];
  const myTurn = state.currentPlayerId === localSessionId;

  return (
    <div className="memory-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div
          className="mm-turn-banner"
          style={{ color: colorForPlayerIndex(currentPlayerIndex) }}
        >
          {myTurn ? "Your turn" : `${currentPlayer.name}'s turn`}
        </div>
      </div>

      <div className="mm-grid">
        {state.cards.map((card) => {
          const faceUp = card.matched || state.flippedIds.includes(card.id);
          return (
            <button
              key={card.id}
              className={`mm-card ${faceUp ? "mm-card--up" : ""} ${card.matched ? "mm-card--matched" : ""}`}
              onClick={() => handleCardClick(card.id)}
              disabled={!myTurn || faceUp}
              aria-label={faceUp ? card.symbol : "Face-down card"}
            >
              <span className="mm-card-inner">
                <span className="mm-card-face mm-card-face--back" />
                <span className="mm-card-face mm-card-face--front">{card.symbol}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="dg-mini-scoreboard">
        {state.players.map((p, i) => (
          <span
            key={p.sessionId}
            className="dg-mini-score"
            style={{ color: colorForPlayerIndex(i) }}
          >
            {p.name}: {state.scores[p.sessionId] ?? 0}
          </span>
        ))}
      </div>
    </div>
  );
}
