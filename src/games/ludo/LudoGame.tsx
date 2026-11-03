import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { colorForPlayerIndex, paleGradientForPlayerIndex } from "../playerColors";
import { Pips } from "../../components/Pips";
import {
  FINISH,
  GRID,
  LAST_TRACK_STEP,
  SAFE_INDICES,
  TOKENS_PER_PLAYER,
  buildCells,
  movableTokens,
  seatsFor,
  tokenPoint,
  trackIndex,
} from "./board";

const GAME_ID = "ludo";
const DIE_ROLL_MS = 600;
const HOP_MS = 220;
const MAX_PLAYERS = 4;

interface LudoPlayer {
  sessionId: string;
  name: string;
  seat: number;
}

interface LastMove {
  id: string;
  playerId: string;
  token: number;
  from: number;
  to: number;
  captured: { playerId: string; token: number; from: number }[];
}

interface PublicState {
  phase: "roll" | "move" | "game-over";
  players: LudoPlayer[];
  tokens: Record<string, number[]>;
  currentPlayerId: string;
  roll: { id: string; value: number } | null;
  movable: number[];
  winnerId: string | null;
  lastMove: LastMove | null;
  message: string;
}

type LudoPayload = PublicState | { token: number } | Record<string, never>;

const CELLS = buildCells();
const pct = (n: number) => `${(n / GRID) * 100}%`;
const uid = () => `${Date.now()}-${Math.random()}`;

export function LudoGame({ onExit }: GameProps) {
  const { state, isHost, startAsHost, updateState, send, onMessage, localSessionId, presentPlayers } =
    useHostGameState<PublicState, LudoPayload>(GAME_ID, "game-over");

  const [dieFace, setDieFace] = useState(6);
  const [rolling, setRolling] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const processedMove = useRef<string | null | undefined>(undefined);
  const processedRoll = useRef<string | null | undefined>(undefined);
  const dieEndsAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  // Shake the die whenever a new roll arrives (skip whatever was already
  // showing when this screen first loaded).
  useEffect(() => {
    const roll = state?.roll ?? null;
    if (processedRoll.current === undefined) {
      processedRoll.current = roll?.id ?? null;
      if (roll) setDieFace(roll.value);
      return;
    }
    if (!roll || processedRoll.current === roll.id) return;
    processedRoll.current = roll.id;
    setRolling(true);
    dieEndsAt.current = Date.now() + DIE_ROLL_MS;
    const cycle = setInterval(() => setDieFace(1 + Math.floor(Math.random() * 6)), 80);
    later(() => {
      clearInterval(cycle);
      setRolling(false);
      setDieFace(roll.value);
    }, DIE_ROLL_MS);
    timers.current.push(cycle as unknown as ReturnType<typeof setTimeout>);
  }, [state?.roll]);

  // Hop the moved token square by square, then send anything it captured
  // back to the yard.
  useEffect(() => {
    const move = state?.lastMove ?? null;
    if (processedMove.current === undefined) {
      processedMove.current = move?.id ?? null;
      setOverrides({}); // re-render so the winner screen can show if we joined late
      return;
    }
    if (!move || processedMove.current === move.id) return;
    processedMove.current = move.id;

    const key = `${move.playerId}:${move.token}`;
    const path: number[] = [];
    if (move.from < 0) path.push(0);
    else for (let p = move.from + 1; p <= move.to; p++) path.push(p);

    const start: Record<string, number> = { [key]: move.from };
    move.captured.forEach((c) => (start[`${c.playerId}:${c.token}`] = c.from));
    setOverrides(start);
    setAnimating(true);

    const delay = Math.max(0, dieEndsAt.current - Date.now());
    path.forEach((p, i) => later(() => setOverrides((o) => ({ ...o, [key]: p })), delay + (i + 1) * HOP_MS));
    later(() => {
      setOverrides({});
      setAnimating(false);
    }, delay + (path.length + 1) * HOP_MS + (move.captured.length ? 250 : 0));
  }, [state?.lastMove]);

  function nextPlayerId(cur: PublicState, playerId: string) {
    const idx = cur.players.findIndex((p) => p.sessionId === playerId);
    return cur.players[(idx + 1) % cur.players.length].sessionId;
  }

  function applyMove(cur: PublicState, token: number) {
    if (!cur.roll || !cur.movable.includes(token)) return;
    const value = cur.roll.value;
    const player = cur.players.find((p) => p.sessionId === cur.currentPlayerId)!;
    const mine = [...cur.tokens[player.sessionId]];
    const from = mine[token];
    const to = from < 0 ? 0 : from + value;
    mine[token] = to;

    const tokens = { ...cur.tokens, [player.sessionId]: mine };
    const captured: LastMove["captured"] = [];
    if (to <= LAST_TRACK_STEP) {
      const idx = trackIndex(player.seat, to);
      if (!SAFE_INDICES.has(idx)) {
        for (const other of cur.players) {
          if (other.sessionId === player.sessionId) continue;
          const theirs = [...tokens[other.sessionId]];
          let hit = false;
          theirs.forEach((p, t) => {
            if (p >= 0 && p <= LAST_TRACK_STEP && trackIndex(other.seat, p) === idx) {
              captured.push({ playerId: other.sessionId, token: t, from: p });
              theirs[t] = -1;
              hit = true;
            }
          });
          if (hit) tokens[other.sessionId] = theirs;
        }
      }
    }

    const won = mine.every((p) => p >= FINISH);
    const bonus = value === 6 || captured.length > 0 || to === FINISH;
    const victimNames = [...new Set(captured.map((c) => cur.players.find((p) => p.sessionId === c.playerId)?.name))];
    let message = "";
    if (captured.length) message = `${player.name} sent ${victimNames.join(" & ")} home!`;
    else if (to === FINISH) message = `${player.name} got a piece home!`;
    if (bonus && !won) message = `${message ? message + " " : ""}${player.name} rolls again.`;

    updateState({
      ...cur,
      tokens,
      phase: won ? "game-over" : "roll",
      movable: [],
      winnerId: won ? player.sessionId : null,
      currentPlayerId: won || bonus ? player.sessionId : nextPlayerId(cur, player.sessionId),
      lastMove: { id: uid(), playerId: player.sessionId, token, from, to, captured },
      message,
    });
  }

  function applyRoll(cur: PublicState) {
    if (cur.phase !== "roll") return;
    const value = 1 + Math.floor(Math.random() * 6);
    const player = cur.players.find((p) => p.sessionId === cur.currentPlayerId)!;
    const progress = cur.tokens[player.sessionId];
    const movable = movableTokens(progress, value);
    const roll = { id: uid(), value };

    if (movable.length === 0) {
      updateState({
        ...cur,
        roll,
        movable: [],
        currentPlayerId: nextPlayerId(cur, player.sessionId),
        message: `${player.name} rolled ${value} — no moves.`,
      });
      return;
    }
    const withRoll: PublicState = { ...cur, roll, movable, phase: "move", message: "" };
    // Only one real choice (e.g. all pieces still in the yard): just move it.
    if (new Set(movable.map((t) => progress[t])).size === 1) {
      applyMove(withRoll, movable[0]);
      return;
    }
    updateState({ ...withRoll, message: `${player.name} rolled ${value} — pick a piece.` });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (!isHost || !state || state.currentPlayerId !== senderId) return;
      if (type === "roll-request") applyRoll(state);
      if (type === "move-request" && state.phase === "move") applyMove(state, (payload as { token: number }).token);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function startGame() {
    const order = presentPlayers.slice(0, MAX_PLAYERS);
    if (order.length < 2) return;
    const seats = seatsFor(order.length);
    const players = order.map((p, i) => ({ sessionId: p.sessionId, name: p.userName, seat: seats[i] }));
    startAsHost({
      phase: "roll",
      players,
      tokens: Object.fromEntries(players.map((p) => [p.sessionId, Array(TOKENS_PER_PLAYER).fill(-1)])),
      currentPlayerId: players[0].sessionId,
      roll: null,
      movable: [],
      winnerId: null,
      lastMove: null,
      message: "Roll a 6 to bring a piece out.",
    });
  }

  const busy = rolling || animating;

  function handleRoll() {
    if (!state || state.phase !== "roll" || state.currentPlayerId !== localSessionId || busy) return;
    if (isHost) applyRoll(state);
    else send("roll-request", {});
  }

  function handlePick(token: number) {
    if (!state || state.phase !== "move" || state.currentPlayerId !== localSessionId || busy) return;
    if (!state.movable.includes(token)) return;
    if (isHost) applyMove(state, token);
    else send("move-request", { token });
  }

  // Where every token is drawn, nudging apart any that share a square.
  const placed = useMemo(() => {
    if (!state) return [];
    const list = state.players.flatMap((p) =>
      state.tokens[p.sessionId].map((prog, t) => {
        const progress = overrides[`${p.sessionId}:${t}`] ?? prog;
        return { player: p, token: t, progress, ...tokenPoint(p.seat, t, progress) };
      })
    );
    const groups = new Map<string, typeof list>();
    list.forEach((item) => {
      if (item.progress < 0 || item.progress >= FINISH) return;
      const k = `${item.x},${item.y}`;
      groups.set(k, [...(groups.get(k) ?? []), item]);
    });
    groups.forEach((g) => {
      if (g.length < 2) return;
      g.forEach((item, i) => {
        const angle = (i / g.length) * Math.PI * 2;
        item.x += Math.cos(angle) * 0.22;
        item.y += Math.sin(angle) * 0.22;
      });
    });
    return list;
  }, [state, overrides]);

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🎲 Ludo</h2>
        <p>Roll a 6 to get out, race all four pieces home, and bump others back to their yard.</p>
        <p className="dg-hint">
          {presentPlayers.length < 2
            ? "Need at least 2 people to have this game open."
            : `${Math.min(presentPlayers.length, MAX_PLAYERS)} players ready (up to 4). Whoever starts runs the game.`}
        </p>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Start game
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (state.phase === "game-over" && !animating && processedMove.current === (state.lastMove?.id ?? null)) {
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

  const current = state.players.find((p) => p.sessionId === state.currentPlayerId)!;
  const myTurn = state.currentPlayerId === localSessionId && state.phase !== "game-over";
  const canPick = myTurn && state.phase === "move" && !busy;
  const seatOwner = (seat: number) => state.players.find((p) => p.seat === seat);

  return (
    <div className="snakes-ladders-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="sl-turn-banner" style={{ color: colorForPlayerIndex(current.seat) }}>
          {myTurn ? (state.phase === "move" ? "Your turn — tap a glowing piece" : "Your turn — roll!") : `${current.name}'s turn`}
        </div>
      </div>

      <div className="sl-board-area">
        <div className="ludo-board">
          {CELLS.flatMap((row, r) =>
            row.map((cell, c) => {
              if (cell.kind === "empty" || cell.kind === "centre" || cell.kind === "yard") return null;
              const style: CSSProperties = { gridRow: r + 1, gridColumn: c + 1 };
              let cls = "ludo-cell";
              if (cell.kind === "home") style.background = colorForPlayerIndex(cell.seat);
              if (cell.kind === "track" && cell.startSeat !== null) style.background = colorForPlayerIndex(cell.startSeat);
              if (cell.kind === "track" && cell.safe) cls += " ludo-cell--safe";
              return (
                <div key={`${r}-${c}`} className={cls} style={style}>
                  {cell.kind === "track" && cell.safe && cell.startSeat === null ? "★" : ""}
                </div>
              );
            })
          )}

          {[0, 1, 2, 3].map((seat) => {
            const owner = seatOwner(seat);
            const [r0, c0] = [
              [0, 0],
              [0, 9],
              [9, 9],
              [9, 0],
            ][seat];
            return (
              <div
                key={seat}
                className={`ludo-yard ${owner ? "" : "ludo-yard--empty"}`}
                style={{ gridRow: `${r0 + 1} / span 6`, gridColumn: `${c0 + 1} / span 6`, background: colorForPlayerIndex(seat) }}
              >
                <div className="ludo-yard-inner" style={{ background: paleGradientForPlayerIndex(seat) }}>
                  <span className="ludo-yard-name">{owner?.name ?? ""}</span>
                </div>
              </div>
            );
          })}

          <div
            className="ludo-centre"
            style={{
              background: `conic-gradient(from -45deg, ${colorForPlayerIndex(1)} 0 90deg, ${colorForPlayerIndex(2)} 90deg 180deg, ${colorForPlayerIndex(3)} 180deg 270deg, ${colorForPlayerIndex(0)} 270deg 360deg)`,
            }}
          />

          {placed.map(({ player, token, progress, x, y }) => {
            const pickable = canPick && player.sessionId === localSessionId && state.movable.includes(token);
            return (
              <button
                key={`${player.sessionId}:${token}`}
                className={`ludo-token ${pickable ? "ludo-token--pickable" : ""} ${progress >= FINISH ? "ludo-token--home" : ""}`}
                style={{ left: pct(x), top: pct(y), background: colorForPlayerIndex(player.seat) }}
                onClick={() => handlePick(token)}
                disabled={!pickable}
                aria-label={`${player.name} piece ${token + 1}`}
              >
                {player.name.charAt(0).toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sl-controls">
        <button
          className={`sl-die ${rolling ? "sl-die--rolling" : ""}`}
          onClick={handleRoll}
          disabled={!myTurn || state.phase !== "roll" || busy}
          aria-label="Roll dice"
        >
          <Pips value={dieFace} />
        </button>
        <div className="ludo-side">
          {state.message && !rolling && <div className="ludo-message">{state.message}</div>}
          <div className="dg-mini-scoreboard">
            {state.players.map((p) => (
              <span key={p.sessionId} className="dg-mini-score" style={{ color: colorForPlayerIndex(p.seat) }}>
                {p.name}: {state.tokens[p.sessionId].filter((t) => t >= FINISH).length}/4 home
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
