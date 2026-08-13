import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { FishPond } from "./FishPond";
import { POINTS, type Difficulty, type FishKind } from "./fish";

const GAME_ID = "fishing-compete";
const COUNTDOWN_MS = 3000;
const WIN_FREEZE_MS = 2200;
const DEFAULT_SCORE_THRESHOLD = 10;
const DEFAULT_TIMER_SECONDS = 60;

type Mode = "score" | "timer";

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: "difficulty" | "target" | "countdown" | "playing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  mode: Mode;
  scoreThreshold: number;
  timerSeconds: number;
  difficultyByPlayer: Record<string, Difficulty | null>;
  countdownStartedAt: number | null;
  playStartedAt: number | null;
  scores: Record<string, number>;
  winnerId: string | null;
}

interface CatchPayload {
  points: number;
}

interface DifficultyPayload {
  difficulty: Difficulty;
}

interface TargetPayload {
  target: number | "timer";
}

type FishingPayload = PublicState | CatchPayload | DifficultyPayload | TargetPayload | Record<string, never>;

export function FishingGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, FishingPayload>(GAME_ID, "game-over");

  const [myDifficulty, setMyDifficulty] = useState<Difficulty | null>(null);
  const [countdownTick, setCountdownTick] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_TIMER_SECONDS);
  const [revealWinner, setRevealWinner] = useState(false);

  const stateRef = useRef<PublicState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Either player picking is enough — whoever picks first sets the
  // difficulty (and therefore fish size/speed) for both of them.
  function applySetDifficulty(current: PublicState, _senderId: string, difficulty: Difficulty) {
    if (current.phase !== "difficulty") return;
    const difficultyByPlayer = Object.fromEntries(current.players.map((p) => [p.sessionId, difficulty]));
    updateState({ ...current, difficultyByPlayer, phase: "target" });
  }

  // Same "first pick wins for both" pattern for the catch target.
  function applySetTarget(current: PublicState, _senderId: string, target: number | "timer") {
    if (current.phase !== "target") return;
    const mode: Mode = target === "timer" ? "timer" : "score";
    const scoreThreshold = typeof target === "number" ? target : current.scoreThreshold;
    const countdownStartedAt = Date.now();
    const next: PublicState = { ...current, mode, scoreThreshold, phase: "countdown", countdownStartedAt };
    updateState(next);
    setTimeout(() => {
      const playing: PublicState = { ...next, phase: "playing", playStartedAt: Date.now() };
      updateState(playing);
      if (playing.mode === "timer") {
        setTimeout(() => finalizeTimer(), playing.timerSeconds * 1000);
      }
    }, COUNTDOWN_MS);
  }

  function finalizeTimer() {
    const current = stateRef.current;
    if (!current || current.phase !== "playing") return;
    const [a, b] = current.players;
    const sa = current.scores[a.sessionId] ?? 0;
    const sb = current.scores[b.sessionId] ?? 0;
    const winnerId = sa === sb ? null : sa > sb ? a.sessionId : b.sessionId;
    updateState({ ...current, phase: "game-over", winnerId });
  }

  function applyCatch(current: PublicState, senderId: string, points: number) {
    if (current.phase !== "playing") return;
    const scores = { ...current.scores, [senderId]: (current.scores[senderId] ?? 0) + points };
    let phase: PublicState["phase"] = current.phase;
    let winnerId = current.winnerId;
    if (current.mode === "score" && scores[senderId] >= current.scoreThreshold) {
      phase = "game-over";
      winnerId = senderId;
    }
    updateState({ ...current, scores, phase, winnerId });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (!isHost || !state) return;
      if (type === "set-difficulty") {
        applySetDifficulty(state, senderId, (payload as DifficultyPayload).difficulty);
        return;
      }
      if (type === "set-target") {
        applySetTarget(state, senderId, (payload as TargetPayload).target);
        return;
      }
      if (type === "catch") {
        applyCatch(state, senderId, (payload as CatchPayload).points);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  useEffect(() => {
    if (state?.phase !== "countdown" || !state.countdownStartedAt) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - state.countdownStartedAt!;
      setCountdownTick(Math.max(1, 3 - Math.floor(elapsed / 1000)));
    }, 100);
    return () => clearInterval(id);
  }, [state?.phase, state?.countdownStartedAt]);

  useEffect(() => {
    if (state?.phase !== "playing" || state.mode !== "timer" || !state.playStartedAt) return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - state.playStartedAt!) / 1000;
      setSecondsLeft(Math.max(0, Math.ceil(state.timerSeconds - elapsed)));
    }, 200);
    return () => clearInterval(id);
  }, [state?.phase, state?.mode, state?.playStartedAt, state?.timerSeconds]);

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

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    setMyDifficulty(null);
    setCountdownTick(3);
    setSecondsLeft(DEFAULT_TIMER_SECONDS);
    startAsHost({
      phase: "difficulty",
      hostId: localSessionId ?? "",
      players: order,
      mode: "score",
      scoreThreshold: DEFAULT_SCORE_THRESHOLD,
      timerSeconds: DEFAULT_TIMER_SECONDS,
      difficultyByPlayer: Object.fromEntries(order.map((p) => [p.sessionId, null])),
      countdownStartedAt: null,
      playStartedAt: null,
      scores: Object.fromEntries(order.map((p) => [p.sessionId, 0])),
      winnerId: null,
    });
  }

  function handleChooseDifficulty(d: Difficulty) {
    setMyDifficulty(d);
    if (!state) return;
    if (isHost) applySetDifficulty(state, localSessionId ?? "", d);
    else send("set-difficulty", { difficulty: d });
  }

  function handleChooseTarget(target: number | "timer") {
    if (!state) return;
    if (isHost) applySetTarget(state, localSessionId ?? "", target);
    else send("set-target", { target });
  }

  function handleCatch(kind: FishKind) {
    const current = stateRef.current;
    if (!current) return;
    const points = POINTS[kind];
    if (isHost) applyCatch(current, localSessionId ?? "", points);
    else send("catch", { points });
  }

  const myDifficultyResolved = (state?.difficultyByPlayer[localSessionId ?? ""] ?? myDifficulty) as Difficulty | null;
  const opponent = state?.players.find((p) => p.sessionId !== localSessionId) ?? null;

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🎣 Fishing Compete</h2>
        <p>Catch fish in your own pond — most points wins.</p>
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
        <h2>{winner ? `🏆 ${winner.name} wins!` : "🤝 It's a tie!"}</h2>
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
    return (
      <div className="dg-lobby">
        <h2>🎣 Fishing Compete</h2>
        <p>Pick a difficulty to start — whoever picks first sets it for both of you.</p>
        <div className="mz-difficulty-picker">
          <button className="mz-difficulty-option" onClick={() => handleChooseDifficulty("easy")}>
            🐣 Easy
            <span>Big, slow fish</span>
          </button>
          <button className="mz-difficulty-option" onClick={() => handleChooseDifficulty("medium")}>
            🧭 Medium
            <span>Smaller, quicker fish</span>
          </button>
          <button className="mz-difficulty-option" onClick={() => handleChooseDifficulty("difficult")}>
            🔥 Difficult
            <span>Small and fast</span>
          </button>
        </div>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (state.phase === "target") {
    return (
      <div className="dg-lobby">
        <h2>🎣 Fishing Compete</h2>
        <p>Pick how to play — whoever picks first sets it for both of you.</p>
        <div className="mz-difficulty-picker">
          <button className="mz-difficulty-option" onClick={() => handleChooseTarget(25)}>
            🎯 25 fish
            <span>First to 25 wins</span>
          </button>
          <button className="mz-difficulty-option" onClick={() => handleChooseTarget(50)}>
            🎯 50 fish
            <span>First to 50 wins</span>
          </button>
          <button className="mz-difficulty-option" onClick={() => handleChooseTarget(100)}>
            🎯 100 fish
            <span>First to 100 wins</span>
          </button>
          <button className="mz-difficulty-option" onClick={() => handleChooseTarget("timer")}>
            ⏱️ 60 second sprint
            <span>Most catches when time's up wins</span>
          </button>
        </div>
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
        <p className="dg-hint">Get your rod ready!</p>
      </div>
    );
  }

  if (!myDifficultyResolved) return null;
  const isFrozenWin = state.phase === "game-over";
  const frozenWinner = isFrozenWin ? state.players.find((p) => p.sessionId === state.winnerId) : null;
  const myScore = state.scores[localSessionId ?? ""] ?? 0;
  const opponentScore = opponent ? state.scores[opponent.sessionId] ?? 0 : 0;

  return (
    <div className="fishing-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="mz-turn-banner">
          {isFrozenWin
            ? frozenWinner
              ? `🏆 ${frozenWinner.name} wins!`
              : "🤝 It's a tie!"
            : state.mode === "timer"
              ? `${secondsLeft}s left`
              : `First to ${state.scoreThreshold}`}
        </div>
      </div>

      <div className="bs-scoreboard">
        <span className="dom-opponent-chip">You: {myScore}</span>
        {opponent && (
          <span className="dom-opponent-chip">
            {opponent.name}: {opponentScore}
          </span>
        )}
      </div>

      <div className="fc-pond-wrap">
        <FishPond difficulty={myDifficultyResolved} active={state.phase === "playing"} onCatch={handleCatch} />
      </div>
    </div>
  );
}
