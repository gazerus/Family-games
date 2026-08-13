import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { colorForPlayerIndex } from "../playerColors";
import { MazePanel } from "./MazePanel";
import {
  NORTH,
  EAST,
  SOUTH,
  WEST,
  generateMaze,
  solveMaze,
  placePowerUps,
  makeRng,
  type Cell,
  type PowerUp,
} from "./maze";

const GAME_ID = "maze-race";
const COUNTDOWN_MS = 3000;
const WIN_FREEZE_MS = 2200;
const NORMAL_MOVE_MS = 140;
const FAST_MOVE_MS = 60;
const SPEED_BOOST_MS = 4000;
const REVEAL_MS = 3000;

type Difficulty = "easy" | "standard";

const SIZE_BY_DIFFICULTY: Record<Difficulty, { width: number; height: number; braid: number; powerUps: number }> = {
  easy: { width: 8, height: 8, braid: 0.55, powerUps: 3 },
  standard: { width: 15, height: 15, braid: 0, powerUps: 2 },
};

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: "difficulty" | "countdown" | "racing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  seed: number;
  difficultyByPlayer: Record<string, Difficulty | null>;
  countdownStartedAt: number | null;
  winnerId: string | null;
}

interface PosPayload {
  row: number;
  col: number;
}

interface DifficultyPayload {
  difficulty: Difficulty;
}

type MazePayload = PublicState | PosPayload | DifficultyPayload | Record<string, never>;

function buildMazeAssets(seed: number, difficulty: Difficulty) {
  const { width, height, braid, powerUps } = SIZE_BY_DIFFICULTY[difficulty];
  const maze = generateMaze(seed, width, height, braid);
  const path = solveMaze(maze);
  const items = placePowerUps(maze, path, makeRng(seed + 1), powerUps);
  return { maze, path, powerUps: items };
}

export function MazeRaceGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    localName,
    presentPlayers,
  } = useHostGameState<PublicState, MazePayload>(GAME_ID, "game-over");

  const [myDifficulty, setMyDifficulty] = useState<Difficulty | null>(null);
  const [myPos, setMyPos] = useState<Cell>({ row: 0, col: 0 });
  const [opponentPos, setOpponentPos] = useState<Cell>({ row: 0, col: 0 });
  const [myTrail, setMyTrail] = useState<Cell[]>([]);
  const [opponentTrail, setOpponentTrail] = useState<Cell[]>([]);
  const [speedBoostUntil, setSpeedBoostUntil] = useState(0);
  const [revealUntil, setRevealUntil] = useState(0);
  const [countdownTick, setCountdownTick] = useState(3);
  const [revealWinner, setRevealWinner] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const stateRef = useRef<PublicState | null>(null);
  const lastMoveAtRef = useRef(0);
  const collectedRef = useRef(new Set<string>());
  const finishedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  function applySetDifficulty(current: PublicState, senderId: string, difficulty: Difficulty) {
    if (current.phase !== "difficulty") return;
    const difficultyByPlayer = { ...current.difficultyByPlayer, [senderId]: difficulty };
    const bothPicked = current.players.every((p) => difficultyByPlayer[p.sessionId]);
    if (!bothPicked) {
      updateState({ ...current, difficultyByPlayer });
      return;
    }
    const countdownStartedAt = Date.now();
    const next: PublicState = { ...current, difficultyByPlayer, phase: "countdown", countdownStartedAt };
    updateState(next);
    setTimeout(() => {
      updateState({ ...next, phase: "racing" });
    }, COUNTDOWN_MS);
  }

  function applyFinish(current: PublicState, senderId: string) {
    if (current.phase !== "racing" || current.winnerId) return;
    updateState({ ...current, phase: "game-over", winnerId: senderId });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type === "pos") {
        const { row, col } = payload as PosPayload;
        setOpponentPos({ row, col });
        setOpponentTrail((prev) => [...prev.slice(-14), { row, col }]);
        return;
      }
      if (!isHost || !state) return;
      if (type === "set-difficulty") {
        applySetDifficulty(state, senderId, (payload as DifficultyPayload).difficulty);
        return;
      }
      if (type === "finished") {
        applyFinish(state, senderId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  // Countdown ticker (3-2-1), purely local — everyone computes it the same
  // way from the shared countdownStartedAt timestamp.
  useEffect(() => {
    if (state?.phase !== "countdown" || !state.countdownStartedAt) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - state.countdownStartedAt!;
      setCountdownTick(Math.max(1, 3 - Math.floor(elapsed / 1000)));
    }, 100);
    return () => clearInterval(id);
  }, [state?.phase, state?.countdownStartedAt]);

  // Freeze the maze on the winning move for a beat before the trophy screen.
  useEffect(() => {
    if (state?.phase !== "game-over") {
      setRevealWinner(false);
      return;
    }
    const t = setTimeout(() => setRevealWinner(true), WIN_FREEZE_MS);
    return () => clearTimeout(t);
  }, [state?.phase, state?.winnerId]);

  useEffect(() => {
    if (state?.phase === "game-over" && revealWinner) {
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
    }
  }, [state?.phase, revealWinner]);

  // Drives the speed-boost/reveal countdown chips.
  useEffect(() => {
    if (speedBoostUntil === 0 && revealUntil === 0) return;
    const id = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(id);
  }, [speedBoostUntil, revealUntil]);

  const myDifficultyResolved = (state?.difficultyByPlayer[localSessionId ?? ""] ?? myDifficulty) as Difficulty | null;
  const opponent = state?.players.find((p) => p.sessionId !== localSessionId) ?? null;
  const opponentDifficulty = opponent ? state?.difficultyByPlayer[opponent.sessionId] ?? null : null;

  const myAssets = useMemo(() => {
    if (!state || !myDifficultyResolved) return null;
    return buildMazeAssets(state.seed, myDifficultyResolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seed, myDifficultyResolved]);

  const opponentAssets = useMemo(() => {
    if (!state || !opponentDifficulty) return null;
    return buildMazeAssets(state.seed, opponentDifficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seed, opponentDifficulty]);

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    setMyDifficulty(null);
    setMyPos({ row: 0, col: 0 });
    setOpponentPos({ row: 0, col: 0 });
    setMyTrail([]);
    setOpponentTrail([]);
    setSpeedBoostUntil(0);
    setRevealUntil(0);
    setCountdownTick(3);
    collectedRef.current = new Set();
    finishedRef.current = false;
    startAsHost({
      phase: "difficulty",
      hostId: localSessionId ?? "",
      players: order,
      seed: Math.floor(Math.random() * 2 ** 31),
      difficultyByPlayer: Object.fromEntries(order.map((p) => [p.sessionId, null])),
      countdownStartedAt: null,
      winnerId: null,
    });
  }

  function handleChooseDifficulty(d: Difficulty) {
    setMyDifficulty(d);
    if (!state) return;
    if (isHost) applySetDifficulty(state, localSessionId ?? "", d);
    else send("set-difficulty", { difficulty: d });
  }

  function attemptMove(dir: number) {
    if (!myAssets || stateRef.current?.phase !== "racing" || finishedRef.current) return;
    const now = Date.now();
    const cooldown = now < speedBoostUntil ? FAST_MOVE_MS : NORMAL_MOVE_MS;
    if (now - lastMoveAtRef.current < cooldown) return;
    const { maze, powerUps, path } = myAssets;

    setMyPos((prev) => {
      const open = maze.open[prev.row][prev.col];
      if (!(open & dir)) return prev;
      const delta =
        dir === NORTH ? [-1, 0] : dir === SOUTH ? [1, 0] : dir === EAST ? [0, 1] : [0, -1];
      const next = { row: prev.row + delta[0], col: prev.col + delta[1] };
      lastMoveAtRef.current = now;
      setMyTrail((t) => [...t.slice(-14), next]);
      send("pos", next);

      const pu = powerUps.find((p: PowerUp) => p.row === next.row && p.col === next.col);
      const key = pu ? `${pu.row},${pu.col}` : null;
      if (pu && key && !collectedRef.current.has(key)) {
        collectedRef.current.add(key);
        if (pu.kind === "speed") setSpeedBoostUntil(Date.now() + SPEED_BOOST_MS);
        else setRevealUntil(Date.now() + REVEAL_MS);
      }

      if (next.row === maze.height - 1 && next.col === maze.width - 1) {
        finishedRef.current = true;
        const current = stateRef.current;
        if (current) {
          if (isHost) applyFinish(current, localSessionId ?? "");
          else send("finished", {});
        }
      }
      void path; // path is only needed for the reveal power-up render, not here
      return next;
    });
  }

  useEffect(() => {
    if (state?.phase !== "racing") return;
    function onKeyDown(e: KeyboardEvent) {
      const map: Record<string, number> = {
        ArrowUp: NORTH,
        w: NORTH,
        W: NORTH,
        ArrowDown: SOUTH,
        s: SOUTH,
        S: SOUTH,
        ArrowLeft: WEST,
        a: WEST,
        A: WEST,
        ArrowRight: EAST,
        d: EAST,
        D: EAST,
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        attemptMove(dir);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, myAssets, speedBoostUntil]);

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🧩 Maze Race</h2>
        <p>Race through your own maze to the exit — first one out wins.</p>
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

  if (state.phase === "difficulty") {
    const amPicked = !!state.difficultyByPlayer[localSessionId ?? ""];
    return (
      <div className="dg-lobby">
        <h2>🧩 Maze Race</h2>
        <p>Pick your own difficulty — everyone races their own maze, so it's still a fair race either way.</p>
        <div className="mz-difficulty-picker">
          <button
            className={`mz-difficulty-option ${myDifficultyResolved === "easy" ? "mz-difficulty-option--picked" : ""}`}
            onClick={() => handleChooseDifficulty("easy")}
          >
            🐣 Easy
            <span>Bigger maze squares, more shortcuts</span>
          </button>
          <button
            className={`mz-difficulty-option ${myDifficultyResolved === "standard" ? "mz-difficulty-option--picked" : ""}`}
            onClick={() => handleChooseDifficulty("standard")}
          >
            🧭 Standard
            <span>Bigger maze, real dead ends</span>
          </button>
        </div>
        {amPicked && <p className="dg-hint">Waiting for {opponent?.name ?? "the other player"}…</p>}
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (state.phase === "countdown") {
    return (
      <div className="dg-lobby mz-countdown">
        <div className="mz-countdown-number">{countdownTick}</div>
        <p className="dg-hint">Get ready to race!</p>
      </div>
    );
  }

  // racing (or game-over, mid win-freeze)
  if (!myAssets) return null;
  const isFrozenWin = state.phase === "game-over";
  const frozenWinner = isFrozenWin ? state.players.find((p) => p.sessionId === state.winnerId) : null;
  const revealActive = Date.now() < revealUntil;
  const speedActive = Date.now() < speedBoostUntil;
  void nowTick; // re-render trigger for the chips above

  return (
    <div className="maze-race-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="mz-turn-banner">
          {isFrozenWin ? `🏆 ${frozenWinner?.name ?? "Someone"} wins!` : "Race to the exit!"}
        </div>
      </div>

      {(speedActive || revealActive) && (
        <div className="mz-power-status">
          {speedActive && <span className="dom-opponent-chip">⚡ Speed boost!</span>}
          {revealActive && <span className="dom-opponent-chip">👁️ Path revealed</span>}
        </div>
      )}

      <div className="mz-panels">
        <MazePanel
          maze={myAssets.maze}
          powerUps={myAssets.powerUps}
          collectedKeys={collectedRef.current}
          path={myAssets.path}
          trail={myTrail}
          color={colorForPlayerIndex(0)}
          initial={(localName || "Y").charAt(0).toUpperCase()}
          targetCell={myPos}
          revealActive={revealActive}
          mine
          label="You"
        />
        {opponentAssets && (
          <MazePanel
            maze={opponentAssets.maze}
            powerUps={opponentAssets.powerUps}
            collectedKeys={new Set()}
            path={opponentAssets.path}
            trail={opponentTrail}
            color={colorForPlayerIndex(1)}
            initial={(opponent?.name || "?").charAt(0).toUpperCase()}
            targetCell={opponentPos}
            revealActive={false}
            mine={false}
            label={opponent?.name ?? "Opponent"}
          />
        )}
      </div>

      <div className="mz-dpad">
        <button className="mz-dpad-btn mz-dpad-btn--up" onClick={() => attemptMove(NORTH)} aria-label="Up">
          ▲
        </button>
        <div className="mz-dpad-row">
          <button className="mz-dpad-btn" onClick={() => attemptMove(WEST)} aria-label="Left">
            ◀
          </button>
          <button className="mz-dpad-btn" onClick={() => attemptMove(SOUTH)} aria-label="Down">
            ▼
          </button>
          <button className="mz-dpad-btn" onClick={() => attemptMove(EAST)} aria-label="Right">
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
