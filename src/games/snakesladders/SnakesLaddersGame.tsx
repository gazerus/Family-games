import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { colorForPlayerIndex } from "../playerColors";
import { Pips } from "../../components/Pips";
import {
  BOARD_SIZE,
  LADDERS,
  LADDER_MAP,
  SNAKES,
  SNAKE_MAP,
  SNAKE_STYLES,
  squareToRowCol,
  snakeBody,
  ladderGeometry,
  type Point,
} from "./board";

const GAME_ID = "snakes-ladders";
const HOP_MS = 600;
const CONNECTOR_PAUSE_MS = 800;
const CONNECTOR_SLIDE_MS = 1600;
const DIE_ROLL_MS = 600;

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface LastMove {
  id: string;
  playerId: string;
  from: number;
  rollValue: number;
  landingSquare: number;
  connector: { from: number; to: number; kind: "ladder" | "snake" } | null;
}

interface PublicState {
  phase: "playing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  positions: Record<string, number>;
  currentPlayerId: string;
  winnerId: string | null;
  lastMove: LastMove | null;
}

type SnakesLaddersPayload = PublicState | Record<string, never>;

export function SnakesLaddersGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, SnakesLaddersPayload>(GAME_ID, "game-over");

  const [animPositions, setAnimPositions] = useState<Record<string, number>>({});
  const [dieFace, setDieFace] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [slidingPlayerId, setSlidingPlayerId] = useState<string | null>(null);
  const [revealWinner, setRevealWinner] = useState(false);
  const processedMoveId = useRef<string | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const squareRefs = useRef(new Map<number, HTMLDivElement>());
  const [positions, setPositions] = useState<Record<number, Point>>({});
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    function recompute() {
      const boardRect = boardRef.current?.getBoundingClientRect();
      if (!boardRect) return;
      const next: Record<number, Point> = {};
      squareRefs.current.forEach((el, n) => {
        const r = el.getBoundingClientRect();
        next[n] = {
          x: r.left - boardRect.left + r.width / 2,
          y: r.top - boardRect.top + r.height / 2,
        };
      });
      setPositions(next);
      setBoardSize({ width: boardRect.width, height: boardRect.height });
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    if (boardRef.current) ro.observe(boardRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [state?.phase]);

  // Seed newly-appeared players (and the initial game state) without animating.
  useEffect(() => {
    if (!state) return;
    setAnimPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of state.players) {
        if (!(p.sessionId in next)) {
          next[p.sessionId] = state.positions[p.sessionId] ?? 1;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [state]);

  // Animate whichever player's turn just resolved: die roll, hop along the
  // path square-by-square, then (if they hit a snake or ladder) slide to it.
  useEffect(() => {
    const move = state?.lastMove;
    if (!move || processedMoveId.current === move.id) return;
    processedMoveId.current = move.id;

    setRolling(true);
    const rollCycle = setInterval(() => setDieFace(1 + Math.floor(Math.random() * 6)), 80);
    const rollTimeout = setTimeout(() => {
      clearInterval(rollCycle);
      setRolling(false);
      setDieFace(move.rollValue);

      const beforeConnector = move.connector ? move.connector.from : move.landingSquare;
      let square = move.from;
      const hop = () => {
        if (square < beforeConnector) {
          square += 1;
          setAnimPositions((prev) => ({ ...prev, [move.playerId]: square }));
          setTimeout(hop, HOP_MS);
        } else if (move.connector) {
          setTimeout(() => {
            setSlidingPlayerId(move.playerId);
            setAnimPositions((prev) => ({ ...prev, [move.playerId]: move.connector!.to }));
            setTimeout(() => setSlidingPlayerId(null), CONNECTOR_SLIDE_MS);
          }, CONNECTOR_PAUSE_MS);
        }
      };
      hop();
    }, DIE_ROLL_MS);

    return () => {
      clearInterval(rollCycle);
      clearTimeout(rollTimeout);
    };
  }, [state?.lastMove]);

  // Don't cut to the trophy screen until the token's actually finished
  // hopping (and sliding, if it landed on a snake/ladder) to its final
  // square — sized to the real animation length, not a guess, so a long
  // winning roll never gets clipped and a short one doesn't leave you
  // waiting on a blank pause.
  useEffect(() => {
    if (state?.phase !== "game-over") {
      setRevealWinner(false);
      return;
    }
    const move = state.lastMove;
    const beforeConnector = move ? (move.connector ? move.connector.from : move.landingSquare) : 0;
    const hops = move ? Math.max(0, beforeConnector - move.from) : 0;
    const connectorTime = move?.connector ? CONNECTOR_PAUSE_MS + CONNECTOR_SLIDE_MS : 0;
    const duration = DIE_ROLL_MS + hops * HOP_MS + connectorTime + 700;
    const t = setTimeout(() => setRevealWinner(true), duration);
    return () => clearTimeout(t);
  }, [state?.phase, state?.winnerId, state?.lastMove]);

  function applyRoll(current: PublicState) {
    if (current.phase !== "playing") return;
    const rollValue = 1 + Math.floor(Math.random() * 6);
    const playerId = current.currentPlayerId;
    const from = current.positions[playerId];
    const beforeConnector = Math.min(BOARD_SIZE, from + rollValue);
    const ladderTo = LADDER_MAP.get(beforeConnector);
    const snakeTo = SNAKE_MAP.get(beforeConnector);
    const connectorTo = ladderTo ?? snakeTo ?? null;
    const landingSquare = connectorTo ?? beforeConnector;

    const lastMove: LastMove = {
      id: `${Date.now()}-${Math.random()}`,
      playerId,
      from,
      rollValue,
      landingSquare,
      connector: connectorTo
        ? { from: beforeConnector, to: connectorTo, kind: ladderTo ? "ladder" : "snake" }
        : null,
    };

    const won = landingSquare >= BOARD_SIZE;
    const idx = current.players.findIndex((p) => p.sessionId === playerId);
    const next = current.players[(idx + 1) % current.players.length];

    updateState({
      ...current,
      positions: { ...current.positions, [playerId]: landingSquare },
      phase: won ? "game-over" : "playing",
      winnerId: won ? playerId : null,
      currentPlayerId: won ? playerId : next.sessionId,
      lastMove,
    });
  }

  useEffect(() => {
    return onMessage((type, _payload, senderId) => {
      if (type !== "roll-request" || !isHost || !state) return;
      if (state.currentPlayerId !== senderId) return;
      applyRoll(state);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function startGame() {
    const order = presentPlayers.map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    setAnimPositions(Object.fromEntries(order.map((p) => [p.sessionId, 1])));
    startAsHost({
      phase: "playing",
      hostId: localSessionId ?? "",
      players: order,
      positions: Object.fromEntries(order.map((p) => [p.sessionId, 1])),
      currentPlayerId: order[0].sessionId,
      winnerId: null,
      lastMove: null,
    });
  }

  function handleRollClick() {
    if (!state || state.phase !== "playing") return;
    if (state.currentPlayerId !== localSessionId || rolling) return;
    if (isHost) {
      applyRoll(state);
    } else {
      send("roll-request", {});
    }
  }

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🐍 Snakes &amp; Ladders</h2>
        <p>Roll the dice, race to square 100 — watch out for snakes!</p>
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

  if (state.phase === "game-over" && revealWinner) {
    const winner = state.players.find((p) => p.sessionId === state.winnerId);
    return (
      <div className="dg-lobby">
        <h2>🏆 {winner?.name ?? "Someone"} wins!</h2>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const myTurn = state.phase === "playing" && state.currentPlayerId === localSessionId;
  const currentIdx = state.players.findIndex((p) => p.sessionId === state.currentPlayerId);
  const currentPlayer = state.players[currentIdx];

  return (
    <div className="snakes-ladders-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="sl-turn-banner" style={{ color: colorForPlayerIndex(currentIdx) }}>
          {myTurn ? "Your turn" : `${currentPlayer.name}'s turn`}
        </div>
      </div>

      <div className="sl-board-area">
        <div className="sl-board" ref={boardRef}>
          {Array.from({ length: BOARD_SIZE }, (_, i) => i + 1).map((n) => {
            const { row, col } = squareToRowCol(n);
            const isLadderStart = LADDER_MAP.has(n);
            const isSnakeStart = SNAKE_MAP.has(n);
            return (
              <div
                key={n}
                ref={(el) => {
                  if (el) squareRefs.current.set(n, el);
                }}
                className={`sl-square ${(row + col) % 2 === 0 ? "sl-square--a" : "sl-square--b"} ${
                  isLadderStart ? "sl-square--ladder" : ""
                } ${isSnakeStart ? "sl-square--snake" : ""}`}
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
              >
                {n}
              </div>
            );
          })}

          {boardSize.width > 0 && (
            <svg
              className="sl-connectors"
              viewBox={`0 0 ${boardSize.width} ${boardSize.height}`}
            >
              {LADDERS.map(([from, to]) => {
                const p1 = positions[from];
                const p2 = positions[to];
                if (!p1 || !p2) return null;
                const { rail1, rail2, rungs } = ladderGeometry(p1, p2);
                return (
                  <g key={`ladder-${from}`}>
                    <line x1={rail1[0].x} y1={rail1[0].y} x2={rail1[1].x} y2={rail1[1].y} className="sl-ladder-rail" />
                    <line x1={rail2[0].x} y1={rail2[0].y} x2={rail2[1].x} y2={rail2[1].y} className="sl-ladder-rail" />
                    {rungs.map((r, i) => (
                      <line key={i} x1={r[0].x} y1={r[0].y} x2={r[1].x} y2={r[1].y} className="sl-ladder-rung" />
                    ))}
                  </g>
                );
              })}
              {SNAKES.map(([from, to], i) => {
                const p1 = positions[from];
                const p2 = positions[to];
                if (!p1 || !p2) return null;
                const { bodyPath, headCenter, headForward } = snakeBody(p1, p2);
                const style = SNAKE_STYLES[i % SNAKE_STYLES.length];
                const perpX = -headForward.y;
                const perpY = headForward.x;
                const eye1 = {
                  x: headCenter.x - headForward.x * 6 + perpX * 5,
                  y: headCenter.y - headForward.y * 6 + perpY * 5,
                };
                const eye2 = {
                  x: headCenter.x - headForward.x * 6 - perpX * 5,
                  y: headCenter.y - headForward.y * 6 - perpY * 5,
                };
                const clipId = `snake-clip-${from}`;
                return (
                  <g key={`snake-${from}`}>
                    {style.stripeColor && (
                      <clipPath id={clipId}>
                        <path d={bodyPath} />
                      </clipPath>
                    )}
                    <path d={bodyPath} fill={style.fill} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
                    {style.stripeColor && (
                      <g clipPath={`url(#${clipId})`}>
                        {Array.from({ length: 8 }, (_, si) => {
                          const t = si / 7;
                          const bx = p1.x + (p2.x - p1.x) * t;
                          const by = p1.y + (p2.y - p1.y) * t;
                          return (
                            <line
                              key={si}
                              x1={bx - 14}
                              y1={by - 14}
                              x2={bx + 14}
                              y2={by + 14}
                              stroke={style.stripeColor}
                              strokeWidth={5}
                            />
                          );
                        })}
                      </g>
                    )}
                    <circle cx={headCenter.x} cy={headCenter.y} r={11} fill={style.fill} />
                    <circle cx={eye1.x} cy={eye1.y} r={2} fill="#000" />
                    <circle cx={eye2.x} cy={eye2.y} r={2} fill="#000" />
                  </g>
                );
              })}
            </svg>
          )}

          {state.players.map((p, i) => {
            const square = animPositions[p.sessionId] ?? 1;
            const pos = positions[square];
            if (!pos) return null;
            const offset = (i - (state.players.length - 1) / 2) * 14;
            return (
              <div
                key={p.sessionId}
                className="sl-token"
                style={{
                  left: pos.x + offset,
                  top: pos.y,
                  background: colorForPlayerIndex(i),
                  transitionDuration: p.sessionId === slidingPlayerId ? `${CONNECTOR_SLIDE_MS}ms` : undefined,
                }}
                title={p.name}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sl-controls">
        <button
          className={`sl-die ${rolling ? "sl-die--rolling" : ""}`}
          onClick={handleRollClick}
          disabled={!myTurn || rolling}
          aria-label="Roll dice"
        >
          <Pips value={dieFace} />
        </button>
        <div className="dg-mini-scoreboard">
          {state.players.map((p, i) => (
            <span key={p.sessionId} className="dg-mini-score" style={{ color: colorForPlayerIndex(i) }}>
              {p.name}: {state.positions[p.sessionId] ?? 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
