import { useEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { BOARD_UNITS, CELL, LEVELS, canClear, distanceToExit, generateHeap, type Dir, type Piece } from "./heap";

const GAME_ID = "arrow-slide";
const EXIT_MS_PER_UNIT = 2.3; // tuned for a snappy-but-smooth glide
const JIGGLE_MS = 320;
const STROKE_WIDTH = CELL - 7; // leaves a thin seam between adjacent pieces

const DIR_XY: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
const PALETTE = ["#d9a5a0", "#a8c3a0", "#b7a8d6", "#d9c39a"]; // dusty rose, sage, lavender, warm sand
const ARROW_GLYPH: Record<Dir, string> = { up: "↑", down: "↓", left: "←", right: "→" };

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: "level-select" | "playing" | "cleared";
  hostId: string;
  players: PublicPlayer[];
  levelId: string | null;
  pieces: Piece[];
  currentPlayerId: string;
}

interface TapPayload {
  pieceId: number;
}

interface LevelPayload {
  levelId: string;
}

type ArrowSlidePayload = PublicState | TapPayload | LevelPayload | Record<string, never>;

interface Exiting {
  piece: Piece;
  startedAt: number;
  duration: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function piecePathD(piece: Piece): string {
  return piece.cells.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
}

function arrowPoints(piece: Piece): string {
  const head = piece.cells[piece.cells.length - 1];
  const { dx, dy } = DIR_XY[piece.dir];
  const perpX = -dy;
  const perpY = dx;
  const tip = { x: head.x + dx * CELL * 0.55, y: head.y + dy * CELL * 0.55 };
  const baseCentre = { x: head.x + dx * CELL * 0.1, y: head.y + dy * CELL * 0.1 };
  const halfWidth = CELL * 0.32;
  const baseL = { x: baseCentre.x + perpX * halfWidth, y: baseCentre.y + perpY * halfWidth };
  const baseR = { x: baseCentre.x - perpX * halfWidth, y: baseCentre.y - perpY * halfWidth };
  return `${tip.x},${tip.y} ${baseL.x},${baseL.y} ${baseR.x},${baseR.y}`;
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

  const prevPiecesRef = useRef<Piece[]>([]);
  const exitingRef = useRef<Exiting[]>([]);
  const rafRef = useRef<number | null>(null);
  const [, forceTick] = useState(0);
  const [jigglingId, setJiggling] = useState<number | null>(null);

  function applyTap(current: PublicState, pieceId: number) {
    if (current.phase !== "playing") return;
    const piece = current.pieces.find((p) => p.id === pieceId);
    if (!piece || !canClear(piece, current.pieces)) return;
    const remaining = current.pieces.filter((p) => p.id !== pieceId);
    const idx = current.players.findIndex((p) => p.sessionId === current.currentPlayerId);
    const next = current.players[(idx + 1) % current.players.length];
    const cleared = remaining.length === 0;
    updateState({
      ...current,
      pieces: remaining,
      phase: cleared ? "cleared" : "playing",
      currentPlayerId: cleared ? current.currentPlayerId : next.sessionId,
    });
  }

  function applySetLevel(current: PublicState, levelId: string) {
    if (current.phase !== "level-select") return;
    updateState({ ...current, phase: "playing", levelId, pieces: generateHeap(levelId) });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (!isHost || !state) return;
      if (type === "set-level") {
        applySetLevel(state, (payload as LevelPayload).levelId);
        return;
      }
      if (type === "tap") {
        if (state.currentPlayerId !== senderId) return;
        applyTap(state, (payload as TapPayload).pieceId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    prevPiecesRef.current = [];
    exitingRef.current = [];
    startAsHost({
      phase: "level-select",
      hostId: localSessionId ?? "",
      players: order,
      levelId: null,
      pieces: [],
      currentPlayerId: order[0].sessionId,
    });
  }

  function chooseLevel(levelId: string) {
    if (!state) return;
    if (isHost) applySetLevel(state, levelId);
    else send("set-level", { levelId });
  }

  // Diff the authoritative board against what was last rendered: a piece
  // that vanished gets an exit animation gliding off in its own direction;
  // everything else needs no animation since pieces never move except when
  // clearing.
  useEffect(() => {
    const next = state?.pieces ?? [];
    const prev = prevPiecesRef.current;
    const nextIds = new Set(next.map((p) => p.id));

    for (const p of prev) {
      if (nextIds.has(p.id)) continue;
      exitingRef.current.push({
        piece: p,
        startedAt: performance.now(),
        duration: Math.max(220, distanceToExit(p) * EXIT_MS_PER_UNIT),
      });
    }
    prevPiecesRef.current = next;
    ensureAnimating();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.pieces]);

  function ensureAnimating() {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }

  function tick() {
    const now = performance.now();
    let animating = false;
    exitingRef.current = exitingRef.current.filter((ex) => {
      const alive = now - ex.startedAt < ex.duration;
      if (alive) animating = true;
      return alive;
    });
    forceTick((n) => n + 1);
    rafRef.current = animating ? requestAnimationFrame(tick) : null;
  }

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function handleTap(piece: Piece) {
    if (!state || state.phase !== "playing") return;
    if (state.currentPlayerId !== localSessionId) return;
    if (!canClear(piece, state.pieces)) {
      setJiggling(piece.id);
      setTimeout(() => setJiggling((cur) => (cur === piece.id ? null : cur)), JIGGLE_MS);
      return;
    }
    if (isHost) applyTap(state, piece.id);
    else send("tap", { pieceId: piece.id });
  }

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>➡️ Arrow Slide</h2>
        <p>Work together to untangle the heap — tap a piece to send it flying off in its arrow's direction.</p>
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
        <h2>🎉 Heap cleared!</h2>
        <p>Nice untangling — you cleared it together.</p>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (state.phase === "level-select") {
    return (
      <div className="dg-lobby as-level-select">
        <h2>➡️ Arrow Slide</h2>
        <p className="dg-hint">Pick a heap to untangle together.</p>
        {LEVELS.map((level) => (
          <button key={level.id} className="as-level-card" onClick={() => chooseLevel(level.id)}>
            <span className="as-level-name">{level.name}</span>
            <span className="as-level-blurb">{level.blurb}</span>
          </button>
        ))}
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const myTurn = state.currentPlayerId === localSessionId;
  const currentPlayer = state.players.find((p) => p.sessionId === state.currentPlayerId);
  const remaining = state.pieces.length;
  const now = performance.now();

  return (
    <div className="arrow-slide-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="as-turn-banner">{myTurn ? "Your turn" : `${currentPlayer?.name}'s turn`}</div>
      </div>

      <p className="dg-round-hint">{remaining} left in the heap</p>

      <div className="as-board-wrap">
        <svg className="as-board" viewBox={`0 0 ${BOARD_UNITS} ${BOARD_UNITS}`} style={{ aspectRatio: "1 / 1" }}>
          {state.pieces.map((piece) => {
            const color = PALETTE[piece.id % PALETTE.length];
            const d = piecePathD(piece);
            return (
              <g
                key={piece.id}
                className={`as-piece-group ${jigglingId === piece.id ? "as-piece--jiggle" : ""}`}
              >
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polygon points={arrowPoints(piece)} fill={color} />
                <text
                  x={piece.cells[piece.cells.length - 1].x}
                  y={piece.cells[piece.cells.length - 1].y}
                  className="as-piece-glyph"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {ARROW_GLYPH[piece.dir]}
                </text>
                <path
                  d={d}
                  className="as-piece-hit"
                  fill="none"
                  stroke="transparent"
                  strokeWidth={CELL}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onClick={myTurn ? () => handleTap(piece) : undefined}
                  style={{ cursor: myTurn ? "pointer" : "default" }}
                  aria-label={`Arrow piece pointing ${piece.dir}`}
                />
              </g>
            );
          })}
          {exitingRef.current.map((ex) => {
            const t = Math.min(1, (now - ex.startedAt) / ex.duration);
            const eased = easeOutCubic(t);
            const dist = distanceToExit(ex.piece) * eased;
            const { dx, dy } = DIR_XY[ex.piece.dir];
            const color = PALETTE[ex.piece.id % PALETTE.length];
            const d = piecePathD(ex.piece);
            return (
              <g
                key={ex.piece.id}
                className="as-piece-group"
                transform={`translate(${dx * dist}, ${dy * dist})`}
                opacity={1 - t * 0.3}
              >
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polygon points={arrowPoints(ex.piece)} fill={color} />
                <text
                  x={ex.piece.cells[ex.piece.cells.length - 1].x}
                  y={ex.piece.cells[ex.piece.cells.length - 1].y}
                  className="as-piece-glyph"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {ARROW_GLYPH[ex.piece.dir]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
