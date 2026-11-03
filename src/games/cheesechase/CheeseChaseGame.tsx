import { useEffect, useMemo, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { colorForPlayerIndex } from "../playerColors";
import { Pips } from "../../components/Pips";

// An 8x8 board whose 28 outer squares form a loop. Square 0 is the mouse
// hole (start, and the only place the cat can't reach you).
const SIDE = 8;
const LOOP = 28;
const HOLE = 0;
const TRAPS = [9, 19];
const CAT_START = 14;
const CHEESE_ON_BOARD = 3;
const WIN_CHEESE = 5;
const MAX_PLAYERS = 4;

const GAME_ID = "cheese-chase";
const DIE_ROLL_MS = 600;
const HOP_MS = 260;
const PAUSE_MS = 500;

function squareRowCol(i: number): [number, number] {
  if (i < 8) return [0, i];
  if (i < 15) return [i - 7, 7];
  if (i < 22) return [7, 21 - i];
  return [28 - i, 0];
}

const wrap = (i: number) => ((i % LOOP) + LOOP) % LOOP;

interface Mouse {
  sessionId: string;
  name: string;
}

interface LastMove {
  id: string;
  playerId: string;
  from: number;
  dir: 1 | -1;
  steps: number;
  event: "cheese" | "trap" | "cat" | null;
  cheeseBefore: number[];
  catFrom: number;
  catSteps: number;
  catVictims: string[];
  victimFrom: Record<string, number>;
}

interface PublicState {
  phase: "roll" | "direction" | "game-over";
  players: Mouse[];
  positions: Record<string, number>;
  cheese: Record<string, number>;
  cheeseSquares: number[];
  cat: number;
  currentPlayerId: string;
  roll: { id: string; value: number } | null;
  winnerId: string | null;
  lastMove: LastMove | null;
  message: string;
}

type Payload = PublicState | { dir: 1 | -1 } | Record<string, never>;

const uid = () => `${Date.now()}-${Math.random()}`;

function placeCheese(existing: number[], cat: number, count: number): number[] {
  const out = [...existing];
  const free = Array.from({ length: LOOP }, (_, i) => i).filter(
    (i) => i !== HOLE && !TRAPS.includes(i) && i !== cat && !out.includes(i)
  );
  while (out.length < count && free.length) {
    out.push(free.splice(Math.floor(Math.random() * free.length), 1)[0]);
  }
  return out;
}

export function CheeseChaseGame({ onExit }: GameProps) {
  const { state, isHost, startAsHost, updateState, send, onMessage, localSessionId, presentPlayers } =
    useHostGameState<PublicState, Payload>(GAME_ID, "game-over");

  const [dieFace, setDieFace] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [mouseOverrides, setMouseOverrides] = useState<Record<string, number>>({});
  const [catOverride, setCatOverride] = useState<number | null>(null);
  const [cheeseOverride, setCheeseOverride] = useState<number[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const processedRoll = useRef<string | null | undefined>(undefined);
  const processedMove = useRef<string | null | undefined>(undefined);
  const dieEndsAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

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

  // Play the turn back: mouse scurries, maybe gets snapped/caught, then the
  // cat prowls and pounces on anyone it lands on.
  useEffect(() => {
    const move = state?.lastMove ?? null;
    if (processedMove.current === undefined) {
      processedMove.current = move?.id ?? null;
      setMouseOverrides({}); // re-render so the winner screen can show if we joined late
      return;
    }
    if (!move || processedMove.current === move.id) return;
    processedMove.current = move.id;

    const startPositions: Record<string, number> = { [move.playerId]: move.from };
    move.catVictims.forEach((v) => {
      if (v !== move.playerId) startPositions[v] = move.victimFrom[v] ?? HOLE;
    });
    setMouseOverrides(startPositions);
    setCatOverride(move.catFrom);
    setCheeseOverride(move.cheeseBefore);
    setAnimating(true);

    let t = Math.max(0, dieEndsAt.current - Date.now());
    for (let s = 1; s <= move.steps; s++) {
      const sq = wrap(move.from + move.dir * s);
      later(() => setMouseOverrides((o) => ({ ...o, [move.playerId]: sq })), (t += HOP_MS));
    }
    t += PAUSE_MS;
    if (move.event === "cheese") {
      later(() => {
        setFlash("🧀 Got the cheese!");
        setCheeseOverride(null);
      }, t);
    } else if (move.event === "trap") {
      later(() => setFlash("🪤 SNAP!"), t);
      later(() => setMouseOverrides((o) => ({ ...o, [move.playerId]: HOLE })), (t += PAUSE_MS * 2));
    } else if (move.event === "cat") {
      later(() => setFlash("🐈 Ran into the cat!"), t);
      later(() => setMouseOverrides((o) => ({ ...o, [move.playerId]: HOLE })), (t += PAUSE_MS * 2));
    }
    t += PAUSE_MS;
    later(() => setFlash(move.catSteps ? "🐈 The cat prowls…" : null), t);
    for (let s = 1; s <= move.catSteps; s++) {
      const sq = wrap(move.catFrom + s);
      later(() => setCatOverride(sq), (t += HOP_MS * 1.6));
    }
    if (move.catVictims.length) {
      later(() => setFlash("🐈 Pounce!"), (t += PAUSE_MS));
      later(() => {
        setMouseOverrides((o) => {
          const n = { ...o };
          move.catVictims.forEach((v) => (n[v] = HOLE));
          return n;
        });
      }, (t += PAUSE_MS * 2));
    }
    later(() => {
      setMouseOverrides({});
      setCatOverride(null);
      setCheeseOverride(null);
      setFlash(null);
      setAnimating(false);
    }, t + PAUSE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.lastMove]);

  function nextPlayerId(cur: PublicState, id: string) {
    const idx = cur.players.findIndex((p) => p.sessionId === id);
    return cur.players[(idx + 1) % cur.players.length].sessionId;
  }

  function applyRoll(cur: PublicState) {
    if (cur.phase !== "roll") return;
    const value = 1 + Math.floor(Math.random() * 6);
    const name = cur.players.find((p) => p.sessionId === cur.currentPlayerId)?.name;
    updateState({ ...cur, phase: "direction", roll: { id: uid(), value }, message: `${name} rolled ${value} — which way?` });
  }

  function applyDirection(cur: PublicState, dir: 1 | -1) {
    if (cur.phase !== "direction" || !cur.roll) return;
    const me = cur.currentPlayerId;
    const name = cur.players.find((p) => p.sessionId === me)?.name ?? "";
    const from = cur.positions[me];
    const steps = cur.roll.value;
    let landing = wrap(from + dir * steps);
    const positions = { ...cur.positions };
    const cheese = { ...cur.cheese };
    let cheeseSquares = [...cur.cheeseSquares];
    let event: LastMove["event"] = null;
    const notes: string[] = [];

    if (TRAPS.includes(landing)) {
      event = "trap";
      if (cheese[me] > 0) cheese[me] -= 1;
      notes.push(`SNAP! ${name} hit a trap and scampered home.`);
      landing = HOLE;
    } else if (landing === cur.cat) {
      event = "cat";
      if (cheese[me] > 0) cheese[me] -= 1;
      notes.push(`${name} ran straight into the cat!`);
      landing = HOLE;
    } else if (cheeseSquares.includes(landing)) {
      event = "cheese";
      cheese[me] += 1;
      cheeseSquares = cheeseSquares.filter((s) => s !== landing);
      notes.push(`${name} grabbed some cheese!`);
    }
    positions[me] = landing;

    const won = cheese[me] >= WIN_CHEESE;
    let cat = cur.cat;
    let catSteps = 0;
    const catVictims: string[] = [];
    const victimFrom: Record<string, number> = {};
    if (!won) {
      catSteps = 1 + Math.floor(Math.random() * 3);
      cat = wrap(cur.cat + catSteps);
      for (const p of cur.players) {
        if (positions[p.sessionId] === cat && cat !== HOLE) {
          catVictims.push(p.sessionId);
          victimFrom[p.sessionId] = positions[p.sessionId];
          positions[p.sessionId] = HOLE;
          if (cheese[p.sessionId] > 0) cheese[p.sessionId] -= 1;
        }
      }
      if (catVictims.length) {
        const names = catVictims.map((v) => cur.players.find((p) => p.sessionId === v)?.name);
        notes.push(`The cat pounced on ${names.join(" & ")}!`);
      }
      cheeseSquares = placeCheese(cheeseSquares, cat, CHEESE_ON_BOARD);
    }

    updateState({
      ...cur,
      phase: won ? "game-over" : "roll",
      positions,
      cheese,
      cheeseSquares,
      cat,
      winnerId: won ? me : null,
      currentPlayerId: won ? me : nextPlayerId(cur, me),
      lastMove: {
        id: uid(),
        playerId: me,
        from,
        dir,
        steps,
        event,
        cheeseBefore: cur.cheeseSquares,
        catFrom: cur.cat,
        catSteps,
        catVictims,
        victimFrom,
      },
      message: notes.join(" "),
    });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (!isHost || !state || state.currentPlayerId !== senderId) return;
      if (type === "roll-request") applyRoll(state);
      if (type === "dir-request") applyDirection(state, (payload as { dir: 1 | -1 }).dir);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function startGame() {
    const players = presentPlayers.slice(0, MAX_PLAYERS).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (players.length < 2) return;
    startAsHost({
      phase: "roll",
      players,
      positions: Object.fromEntries(players.map((p) => [p.sessionId, HOLE])),
      cheese: Object.fromEntries(players.map((p) => [p.sessionId, 0])),
      cheeseSquares: placeCheese([], CAT_START, CHEESE_ON_BOARD),
      cat: CAT_START,
      currentPlayerId: players[0].sessionId,
      roll: null,
      winnerId: null,
      lastMove: null,
      message: `First mouse to ${WIN_CHEESE} cheese wins!`,
    });
  }

  const busy = rolling || animating;

  function handleRoll() {
    if (!state || state.phase !== "roll" || state.currentPlayerId !== localSessionId || busy) return;
    if (isHost) applyRoll(state);
    else send("roll-request", {});
  }

  function handleDirection(dir: 1 | -1) {
    if (!state || state.phase !== "direction" || state.currentPlayerId !== localSessionId || busy) return;
    if (isHost) applyDirection(state, dir);
    else send("dir-request", { dir });
  }

  const shown = useMemo(() => {
    if (!state) return null;
    const positions = { ...state.positions, ...mouseOverrides };
    return {
      positions,
      cat: catOverride ?? state.cat,
      cheeseSquares: cheeseOverride ?? state.cheeseSquares,
    };
  }, [state, mouseOverrides, catOverride, cheeseOverride]);

  if (!state || !shown) {
    return (
      <div className="dg-lobby">
        <h2>🧀 Cheese Chase</h2>
        <p>
          Scurry round the kitchen grabbing cheese. Pick your direction each roll — dodge the mousetraps, and watch out
          for the cat, who prowls after every turn!
        </p>
        <p className="dg-hint">
          {presentPlayers.length < 2
            ? "Need at least 2 people to have this game open."
            : `${Math.min(presentPlayers.length, MAX_PLAYERS)} mice ready (up to 4). Whoever starts runs the game.`}
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
        <p>🧀 × {WIN_CHEESE} — the cheesiest mouse in the house.</p>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const currentIdx = state.players.findIndex((p) => p.sessionId === state.currentPlayerId);
  const current = state.players[currentIdx];
  const myTurn = state.currentPlayerId === localSessionId && state.phase !== "game-over";
  const choosing = myTurn && state.phase === "direction" && !busy && state.roll;
  const targets = choosing
    ? { cw: wrap(state.positions[localSessionId!] + state.roll!.value), ccw: wrap(state.positions[localSessionId!] - state.roll!.value) }
    : null;

  // Mice sharing a square fan out a little.
  const bySquare = new Map<number, string[]>();
  state.players.forEach((p) => {
    const sq = shown.positions[p.sessionId];
    bySquare.set(sq, [...(bySquare.get(sq) ?? []), p.sessionId]);
  });

  return (
    <div className="snakes-ladders-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="sl-turn-banner" style={{ color: colorForPlayerIndex(currentIdx) }}>
          {myTurn ? (state.phase === "direction" ? "Your turn — pick a way" : "Your turn — roll!") : `${current.name}'s turn`}
        </div>
      </div>

      <div className="sl-board-area">
        <div className="cc-board">
          {Array.from({ length: LOOP }, (_, i) => {
            const [r, c] = squareRowCol(i);
            const isTarget = targets && (i === targets.cw || i === targets.ccw);
            return (
              <button
                key={i}
                className={`cc-square ${i === HOLE ? "cc-square--hole" : ""} ${TRAPS.includes(i) ? "cc-square--trap" : ""} ${
                  isTarget ? "cc-square--target" : ""
                }`}
                style={{ gridRow: r + 1, gridColumn: c + 1 }}
                disabled={!isTarget}
                onClick={() => targets && handleDirection(i === targets.cw ? 1 : -1)}
              >
                {i === HOLE ? "🕳️" : TRAPS.includes(i) ? "🪤" : shown.cheeseSquares.includes(i) ? "🧀" : ""}
              </button>
            );
          })}

          <div className="cc-middle">
            {flash ? (
              <div className="cc-flash">{flash}</div>
            ) : (
              <div className="cc-scores">
                {state.players.map((p, i) => (
                  <div key={p.sessionId} style={{ color: colorForPlayerIndex(i) }}>
                    🐭 {p.name}: {"🧀".repeat(state.cheese[p.sessionId])}
                    <span className="cc-score-count"> {state.cheese[p.sessionId]}/{WIN_CHEESE}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(() => {
            const [r, c] = squareRowCol(shown.cat);
            return (
              <div className="cc-piece cc-cat" style={{ left: `${((c + 0.5) / SIDE) * 100}%`, top: `${((r + 0.5) / SIDE) * 100}%` }}>
                🐈
              </div>
            );
          })()}

          {state.players.map((p, i) => {
            const sq = shown.positions[p.sessionId];
            const [r, c] = squareRowCol(sq);
            const group = bySquare.get(sq) ?? [p.sessionId];
            const k = group.indexOf(p.sessionId);
            const spread = group.length > 1 ? (k - (group.length - 1) / 2) * 0.28 : 0;
            return (
              <div
                key={p.sessionId}
                className="cc-piece cc-mouse"
                style={{
                  left: `${((c + 0.5 + spread) / SIDE) * 100}%`,
                  top: `${((r + 0.5 + (group.length > 1 ? 0.18 : 0)) / SIDE) * 100}%`,
                  background: colorForPlayerIndex(i),
                }}
                title={p.name}
              >
                🐭
              </div>
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
          {choosing ? (
            <div className="cc-dir-buttons">
              <button className="primary-button" onClick={() => handleDirection(-1)}>
                ↺ Back
              </button>
              <button className="primary-button" onClick={() => handleDirection(1)}>
                Forward ↻
              </button>
            </div>
          ) : (
            state.message && !busy && <div className="ludo-message">{state.message}</div>
          )}
          {choosing && <div className="dg-hint">Or tap a glowing square.</div>}
        </div>
      </div>
    </div>
  );
}
