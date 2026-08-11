import { useEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { DominoTile } from "./DominoTile";
import {
  HAND_SIZE,
  findStartingPlayer,
  makeDeck,
  matchesEnd,
  orientForEnd,
  pipSum,
  type Tile,
} from "./deck";

const GAME_ID = "dominoes";

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: "playing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  handCounts: Record<string, number>;
  chain: Tile[];
  leftEnd: number | null;
  rightEnd: number | null;
  boneyardCount: number;
  currentPlayerId: string;
  winnerId: string | null;
  isDraw: boolean;
  passStreak: number;
}

interface HandPayload {
  hand: Tile[];
}

interface PlayPayload {
  tileId: number;
  end: "left" | "right";
}

type DominoesPayload = PublicState | HandPayload | PlayPayload | Record<string, never>;

export function DominoesGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, DominoesPayload>(GAME_ID, "game-over");

  const [myHand, setMyHand] = useState<Tile[]>([]);
  const [pendingEndChoice, setPendingEndChoice] = useState<Tile | null>(null);
  const handsRef = useRef<Record<string, Tile[]>>({});
  const boneyardRef = useRef<Tile[]>([]);

  function sendHand(playerId: string, hand: Tile[]) {
    if (playerId === localSessionId) {
      setMyHand(hand);
    } else {
      send("hand", { hand }, playerId);
    }
  }

  function applyPlay(current: PublicState, senderId: string, tileId: number, end: "left" | "right") {
    if (current.phase !== "playing" || current.currentPlayerId !== senderId) return;
    const hand = handsRef.current[senderId] ?? [];
    const tile = hand.find((t) => t.id === tileId);
    if (!tile) return;
    const targetEnd = end === "left" ? current.leftEnd : current.rightEnd;
    if (targetEnd === null || !matchesEnd(tile, targetEnd)) return;

    const oriented = orientForEnd(tile, targetEnd, end);
    const chain = end === "right" ? [...current.chain, oriented] : [oriented, ...current.chain];
    const leftEnd = end === "left" ? oriented.a : current.leftEnd;
    const rightEnd = end === "right" ? oriented.b : current.rightEnd;

    handsRef.current[senderId] = hand.filter((t) => t.id !== tileId);
    sendHand(senderId, handsRef.current[senderId]);

    const emptied = handsRef.current[senderId].length === 0;
    const idx = current.players.findIndex((p) => p.sessionId === senderId);
    const next = current.players[(idx + 1) % current.players.length];

    updateState({
      ...current,
      chain,
      leftEnd,
      rightEnd,
      handCounts: { ...current.handCounts, [senderId]: handsRef.current[senderId].length },
      phase: emptied ? "game-over" : "playing",
      winnerId: emptied ? senderId : null,
      currentPlayerId: emptied ? senderId : next.sessionId,
      passStreak: 0,
    });
  }

  function applyDraw(current: PublicState, senderId: string) {
    if (current.phase !== "playing" || current.currentPlayerId !== senderId) return;
    if (boneyardRef.current.length === 0) return;
    const tile = boneyardRef.current.pop()!;
    handsRef.current[senderId] = [...(handsRef.current[senderId] ?? []), tile];
    sendHand(senderId, handsRef.current[senderId]);
    updateState({
      ...current,
      boneyardCount: boneyardRef.current.length,
      handCounts: { ...current.handCounts, [senderId]: handsRef.current[senderId].length },
    });
  }

  function applyPass(current: PublicState, senderId: string) {
    if (current.phase !== "playing" || current.currentPlayerId !== senderId) return;
    if (boneyardRef.current.length > 0) return;
    const passStreak = current.passStreak + 1;

    if (passStreak >= current.players.length) {
      let winnerId: string | null = null;
      let lowest = Infinity;
      let isDraw = false;
      for (const p of current.players) {
        const sum = pipSum(handsRef.current[p.sessionId] ?? []);
        if (sum < lowest) {
          lowest = sum;
          winnerId = p.sessionId;
          isDraw = false;
        } else if (sum === lowest) {
          isDraw = true;
        }
      }
      updateState({ ...current, phase: "game-over", winnerId: isDraw ? null : winnerId, isDraw, passStreak });
      return;
    }

    const idx = current.players.findIndex((p) => p.sessionId === senderId);
    const next = current.players[(idx + 1) % current.players.length];
    updateState({ ...current, currentPlayerId: next.sessionId, passStreak });
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
        const { tileId, end } = payload as PlayPayload;
        applyPlay(state, senderId, tileId, end);
      } else if (type === "draw") {
        applyDraw(state, senderId);
      } else if (type === "pass") {
        applyPass(state, senderId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function startGame() {
    const order = presentPlayers.map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;

    const deck = makeDeck();
    const hands: Record<string, Tile[]> = {};
    for (const p of order) hands[p.sessionId] = deck.splice(0, HAND_SIZE);
    handsRef.current = hands;
    boneyardRef.current = deck;

    const orderIds = order.map((p) => p.sessionId);
    const { playerId: starterId, tile: starterTile } = findStartingPlayer(orderIds, hands);
    handsRef.current[starterId] = handsRef.current[starterId].filter((t) => t.id !== starterTile.id);
    const starterIdx = order.findIndex((p) => p.sessionId === starterId);
    const nextPlayer = order[(starterIdx + 1) % order.length];

    startAsHost({
      phase: "playing",
      hostId: localSessionId ?? "",
      players: order,
      handCounts: Object.fromEntries(order.map((p) => [p.sessionId, handsRef.current[p.sessionId].length])),
      chain: [starterTile],
      leftEnd: starterTile.a,
      rightEnd: starterTile.b,
      boneyardCount: boneyardRef.current.length,
      currentPlayerId: nextPlayer.sessionId,
      winnerId: null,
      isDraw: false,
      passStreak: 0,
    });
    for (const p of order) sendHand(p.sessionId, handsRef.current[p.sessionId]);
    setPendingEndChoice(null);
  }

  function canPlayLeft(t: Tile) {
    return state?.leftEnd != null && matchesEnd(t, state.leftEnd);
  }
  function canPlayRight(t: Tile) {
    return state?.rightEnd != null && matchesEnd(t, state.rightEnd);
  }

  function handleTileTap(tile: Tile) {
    if (!state || state.currentPlayerId !== localSessionId) return;
    const left = canPlayLeft(tile);
    const right = canPlayRight(tile);
    if (!left && !right) return;
    if (left && right) {
      setPendingEndChoice(tile);
      return;
    }
    playTile(tile, left ? "left" : "right");
  }

  function playTile(tile: Tile, end: "left" | "right") {
    if (!state) return;
    if (isHost) applyPlay(state, localSessionId ?? "", tile.id, end);
    else send("play", { tileId: tile.id, end });
    setPendingEndChoice(null);
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
        <h2>🁣 Dominoes</h2>
        <p>Match the open ends of the chain. First to empty their hand wins.</p>
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
        <h2>{state.isDraw ? "🤝 It's a draw!" : `🏆 ${winner?.name ?? "Someone"} wins!`}</h2>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
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
  const canPlayNow = myTurn && myHand.some((t) => canPlayLeft(t) || canPlayRight(t));
  const opponents = state.players.filter((p) => p.sessionId !== localSessionId);

  return (
    <div className="dominoes-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="dom-turn-banner">{myTurn ? "Your turn" : `${currentPlayer?.name}'s turn`}</div>
      </div>

      <div className="dom-opponents">
        {opponents.map((p) => (
          <span key={p.sessionId} className="dom-opponent-chip">
            {p.name}: {state.handCounts[p.sessionId] ?? 0} 🁢
          </span>
        ))}
        <span className="dom-opponent-chip">Boneyard: {state.boneyardCount} 🁢</span>
      </div>

      <div className="dom-chain-wrap">
        <div className="dom-chain">
          {state.chain.map((t) => (
            <DominoTile key={t.id} a={t.a} b={t.b} />
          ))}
        </div>
      </div>

      {pendingEndChoice && (
        <div className="dom-end-choice">
          <span>Play on which end?</span>
          <button onClick={() => playTile(pendingEndChoice, "left")}>Left ({state.leftEnd})</button>
          <button onClick={() => playTile(pendingEndChoice, "right")}>Right ({state.rightEnd})</button>
          <button className="link-button" onClick={() => setPendingEndChoice(null)}>
            Cancel
          </button>
        </div>
      )}

      <div className="dom-hand">
        {myHand.map((t) => (
          <DominoTile
            key={t.id}
            a={t.a}
            b={t.b}
            dimmed={!myTurn || !(canPlayLeft(t) || canPlayRight(t))}
            onClick={() => handleTileTap(t)}
          />
        ))}
      </div>

      {myTurn && !canPlayNow && (
        <div className="dom-actions">
          {state.boneyardCount > 0 ? (
            <button className="primary-button" onClick={handleDraw}>
              Draw a tile
            </button>
          ) : (
            <button className="primary-button" onClick={handlePass}>
              Pass
            </button>
          )}
        </div>
      )}
    </div>
  );
}
