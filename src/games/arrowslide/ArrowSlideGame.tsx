import { useEffect, useLayoutEffect, useRef } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { GRID_SIZE, generateGrid, slidePiece, type Dir, type Piece } from "./grid";

const GAME_ID = "arrow-slide";
const TOTAL_PIECES = GRID_SIZE * GRID_SIZE;

const ARROW_FILL = "#1b2a4a";
const BOARD_BG = "#f2f3f6";

const DELTA: Record<Dir, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};
// Local coords are drawn pointing "right"; rotate to match each direction.
const ANGLE: Record<Dir, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

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

interface GridPos {
  row: number;
  col: number;
}

interface Tween {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  startedAt: number;
  duration: number;
}

interface Exiting {
  id: number;
  dir: Dir;
  fromRow: number;
  fromCol: number;
  startedAt: number;
  duration: number;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// How far (in cells) a piece has to travel to be fully clear of the board
// in its own direction — used to size + time the exit animation so it
// actually crosses the edge instead of just nudging toward it.
function distanceToExit(row: number, col: number, dir: Dir): number {
  if (dir === "up") return row + 1;
  if (dir === "down") return GRID_SIZE - row;
  if (dir === "left") return col + 1;
  return GRID_SIZE - col;
}

function tweenDuration(cells: number): number {
  return Math.round(90 + cells * 45);
}

function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, dir: Dir) {
  const halfLen = cell * 0.42;
  const shaftHalfW = cell * 0.15;
  const headHalfW = cell * 0.3;
  const headLen = cell * 0.34;
  const tipX = halfLen;
  const tailX = -halfLen;
  const headBaseX = tipX - headLen;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ANGLE[dir]);
  ctx.beginPath();
  ctx.moveTo(tailX, -shaftHalfW);
  ctx.lineTo(headBaseX, -shaftHalfW);
  ctx.lineTo(headBaseX, -headHalfW);
  ctx.lineTo(tipX, 0);
  ctx.lineTo(headBaseX, headHalfW);
  ctx.lineTo(headBaseX, shaftHalfW);
  ctx.lineTo(tailX, shaftHalfW);
  ctx.closePath();
  ctx.fillStyle = ARROW_FILL;
  ctx.shadowColor = "rgba(15, 23, 42, 0.3)";
  ctx.shadowBlur = cell * 0.05;
  ctx.shadowOffsetY = cell * 0.03;
  ctx.fill();
  ctx.restore();
}

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
  const prevPiecesRef = useRef<Piece[]>([]);
  const displayPosRef = useRef(new Map<number, GridPos>());
  const tweensRef = useRef(new Map<number, Tween>());
  const exitingRef = useRef<Exiting[]>([]);
  const rafRef = useRef<number | null>(null);
  const piecesRef = useRef<Piece[]>([]);
  piecesRef.current = state?.pieces ?? [];

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || canvas.width === 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const cell = w / GRID_SIZE;

    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, w, h);

    for (const piece of piecesRef.current) {
      const pos = displayPosRef.current.get(piece.id) ?? { row: piece.row, col: piece.col };
      drawArrow(ctx, (pos.col + 0.5) * cell, (pos.row + 0.5) * cell, cell, piece.dir);
    }
    for (const ex of exitingRef.current) {
      const t = Math.min(1, (performance.now() - ex.startedAt) / ex.duration);
      const eased = easeOutQuad(t);
      const dist = distanceToExit(ex.fromRow, ex.fromCol, ex.dir);
      const [dr, dc] = DELTA[ex.dir];
      const row = ex.fromRow + dr * dist * eased;
      const col = ex.fromCol + dc * dist * eased;
      drawArrow(ctx, (col + 0.5) * cell, (row + 0.5) * cell, cell, ex.dir);
    }
  }

  function tick() {
    const now = performance.now();
    let animating = false;

    for (const [id, tw] of tweensRef.current) {
      const t = Math.min(1, (now - tw.startedAt) / tw.duration);
      const eased = easeOutQuad(t);
      displayPosRef.current.set(id, {
        row: tw.fromRow + (tw.toRow - tw.fromRow) * eased,
        col: tw.fromCol + (tw.toCol - tw.fromCol) * eased,
      });
      if (t >= 1) tweensRef.current.delete(id);
      else animating = true;
    }

    exitingRef.current = exitingRef.current.filter((ex) => now - ex.startedAt < ex.duration);
    if (exitingRef.current.length > 0) animating = true;

    draw();
    rafRef.current = animating ? requestAnimationFrame(tick) : null;
  }

  function ensureAnimating() {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }

  // Diff the authoritative board against what was last rendered: pieces that
  // vanished get an exit animation sliding off in their own direction,
  // pieces that moved get a tween to their new cell, and everything else is
  // seeded directly. Runs for both the tapper and the other client, since
  // both just see `state.pieces` change the same way.
  useEffect(() => {
    const next = state?.pieces ?? [];
    const prev = prevPiecesRef.current;
    const nextById = new Map(next.map((p) => [p.id, p]));
    const prevById = new Map(prev.map((p) => [p.id, p]));

    for (const p of prev) {
      if (nextById.has(p.id)) continue;
      const pos = displayPosRef.current.get(p.id) ?? { row: p.row, col: p.col };
      exitingRef.current.push({
        id: p.id,
        dir: p.dir,
        fromRow: pos.row,
        fromCol: pos.col,
        startedAt: performance.now(),
        duration: tweenDuration(distanceToExit(pos.row, pos.col, p.dir)),
      });
      displayPosRef.current.delete(p.id);
    }

    for (const p of next) {
      const old = prevById.get(p.id);
      if (!old) {
        displayPosRef.current.set(p.id, { row: p.row, col: p.col });
      } else if (old.row !== p.row || old.col !== p.col) {
        const from = displayPosRef.current.get(p.id) ?? { row: old.row, col: old.col };
        tweensRef.current.set(p.id, {
          fromRow: from.row,
          fromCol: from.col,
          toRow: p.row,
          toCol: p.col,
          startedAt: performance.now(),
          duration: tweenDuration(Math.abs(p.row - old.row) + Math.abs(p.col - old.col)),
        });
      } else if (!displayPosRef.current.has(p.id)) {
        displayPosRef.current.set(p.id, { row: p.row, col: p.col });
      }
    }

    prevPiecesRef.current = next;
    draw();
    ensureAnimating();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.pieces]);

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
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

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
    prevPiecesRef.current = [];
    displayPosRef.current.clear();
    tweensRef.current.clear();
    exitingRef.current = [];
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
