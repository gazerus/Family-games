import { useEffect, useLayoutEffect, useRef } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { GRID_SIZE, generateGrid, slidePiece, type Dir, type Piece } from "./grid";

const GAME_ID = "arrow-slide";
const TOTAL_PIECES = GRID_SIZE * GRID_SIZE;

const DIR_COLOR: Record<Dir, string> = {
  up: "#3b82f6",
  right: "#22c55e",
  down: "#e11d48",
  left: "#f97316",
};

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: "playing" | "cleared";
  hostId: string;
  players: PublicPlayer[];
  pieces: Piece[];
  currentPlayerId: string;
}

interface TapPayload {
  pieceId: number;
}

type ArrowSlidePayload = PublicState | TapPayload | Record<string, never>;

export function ArrowSlideGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, ArrowSlidePayload>(GAME_ID, "cleared");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.pieces]);

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || canvas.width === 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const cell = w / GRID_SIZE;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = Math.max(1, cell * 0.02);
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(w, i * cell);
      ctx.stroke();
    }

    const pad = cell * 0.08;
    const radius = cell * 0.16;
    for (const piece of state?.pieces ?? []) {
      const x = piece.col * cell + pad;
      const y = piece.row * cell + pad;
      const size = cell - pad * 2;
      ctx.fillStyle = DIR_COLOR[piece.dir];
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, radius);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = `${Math.round(size * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const arrow = piece.dir === "up" ? "↑" : piece.dir === "down" ? "↓" : piece.dir === "left" ? "←" : "→";
      ctx.fillText(arrow, x + size / 2, y + size / 2 + size * 0.03);
    }
  }

  function applyTap(current: PublicState, pieceId: number) {
    if (current.phase !== "playing") return;
    const result = slidePiece(current.pieces, pieceId);
    if (!result.moved) return;
    const idx = current.players.findIndex((p) => p.sessionId === current.currentPlayerId);
    const next = current.players[(idx + 1) % current.players.length];
    const cleared = result.pieces.length === 0;
    updateState({
      ...current,
      pieces: result.pieces,
      phase: cleared ? "cleared" : "playing",
      currentPlayerId: cleared ? current.currentPlayerId : next.sessionId,
    });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type !== "tap" || !isHost || !state) return;
      if (state.currentPlayerId !== senderId) return;
      applyTap(state, (payload as TapPayload).pieceId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    startAsHost({
      phase: "playing",
      hostId: localSessionId ?? "",
      players: order,
      pieces: generateGrid(),
      currentPlayerId: order[0].sessionId,
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!state || state.phase !== "playing") return;
    if (state.currentPlayerId !== localSessionId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const cell = canvas.width / GRID_SIZE;
    const col = Math.floor(((e.clientX - rect.left) * ratio) / cell);
    const row = Math.floor(((e.clientY - rect.top) * ratio) / cell);
    const piece = state.pieces.find((p) => p.row === row && p.col === col);
    if (!piece) return;
    if (isHost) {
      applyTap(state, piece.id);
    } else {
      send("tap", { pieceId: piece.id });
    }
  }

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>➡️ Arrow Slide</h2>
        <p>
          Work together to clear the board — tap a piece to slide it the way its arrow points. It
          slides off the board if the path's clear, or stops next to whatever's blocking it.
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

  if (state.phase === "cleared") {
    return (
      <div className="dg-lobby">
        <h2>🎉 Board cleared!</h2>
        <p>Nice teamwork — you cleared the whole grid together.</p>
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
  const remaining = state.pieces.length;

  return (
    <div className="arrow-slide-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="as-turn-banner">{myTurn ? "Your turn" : `${currentPlayer?.name}'s turn`}</div>
      </div>

      <p className="dg-round-hint">
        {remaining} of {TOTAL_PIECES} pieces left
      </p>

      <div className="as-board-wrap">
        <canvas
          ref={canvasRef}
          className="as-canvas"
          style={{ aspectRatio: "1 / 1" }}
          onPointerDown={handlePointerDown}
        />
      </div>
    </div>
  );
}
