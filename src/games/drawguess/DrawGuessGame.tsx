import { useEffect, useMemo, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { pickRandomWord } from "./words";
import { DrawCanvas } from "./DrawCanvas";
import type { DrawCanvasHandle, StrokeBatch } from "./DrawCanvas";

const GAME_ID = "draw-guess";
const PICTURES_PER_PLAYER = 5;
const REVEAL_PAUSE_MS = 2500;

type Phase = "drawing" | "round-end" | "game-over";
type Outcome = "solved" | "skipped";

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface DrawerStats {
  solved: number;
  skipped: number;
  totalMs: number;
}

interface PublicState {
  phase: Phase;
  hostId: string;
  hostName: string;
  players: PublicPlayer[];
  stats: Record<string, DrawerStats>;
  currentDrawerId: string | null;
  wordLength: number | null;
  roundStartedAt: number | null;
  revealedWord: string | null;
  lastOutcome: Outcome | null;
  lastElapsedMs: number | null;
  round: number;
  totalRounds: number;
}

interface WordPayload {
  word: string;
}

type DrawGuessPayload = PublicState | WordPayload | StrokeBatch | Record<string, never>;

interface FeedEntry {
  id: string;
  text: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

export function DrawGuessGame({ onExit }: GameProps) {
  const {
    state: publicState,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localName,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, DrawGuessPayload>(GAME_ID, "game-over");

  const [localWord, setLocalWord] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const canvasRef = useRef<DrawCanvasHandle>(null);
  const hostWordRef = useRef<string | null>(null);
  const usedWordsRef = useRef(new Set<string>());
  const feedRef = useRef<HTMLDivElement>(null);

  function pushFeed(text: string) {
    setFeed((prev) => [...prev, { text, id: `${Date.now()}-${Math.random()}` }]);
  }

  function assignWord(drawerId: string, state: PublicState) {
    const word = pickRandomWord(usedWordsRef.current);
    usedWordsRef.current.add(word);
    hostWordRef.current = word;
    state.wordLength = word.length;
    if (drawerId === localSessionId) {
      setLocalWord(word);
    } else {
      send("word", { word }, drawerId);
    }
  }

  function startGame() {
    const order = presentPlayers.map((p) => ({
      sessionId: p.sessionId,
      name: p.userName,
    }));
    if (order.length < 2) return;

    usedWordsRef.current = new Set();
    setFeed([]);
    setLocalWord(null);

    const state: PublicState = {
      phase: "drawing",
      hostId: localSessionId ?? "",
      hostName: localName,
      players: order,
      stats: Object.fromEntries(order.map((p) => [p.sessionId, { solved: 0, skipped: 0, totalMs: 0 }])),
      currentDrawerId: order[0].sessionId,
      wordLength: null,
      roundStartedAt: Date.now(),
      revealedWord: null,
      lastOutcome: null,
      lastElapsedMs: null,
      round: 1,
      totalRounds: order.length * PICTURES_PER_PLAYER,
    };
    assignWord(order[0].sessionId, state);
    startAsHost(state);
  }

  function endRound(state: PublicState, outcome: Outcome) {
    const elapsed = Date.now() - (state.roundStartedAt ?? Date.now());
    const drawerId = state.currentDrawerId;
    const prevStats = (drawerId && state.stats[drawerId]) || { solved: 0, skipped: 0, totalMs: 0 };
    const nextStats: DrawerStats =
      outcome === "solved"
        ? { ...prevStats, solved: prevStats.solved + 1, totalMs: prevStats.totalMs + elapsed }
        : { ...prevStats, skipped: prevStats.skipped + 1 };
    const next: PublicState = {
      ...state,
      phase: "round-end",
      revealedWord: hostWordRef.current,
      roundStartedAt: null,
      lastOutcome: outcome,
      lastElapsedMs: outcome === "solved" ? elapsed : null,
      stats: drawerId ? { ...state.stats, [drawerId]: nextStats } : state.stats,
    };
    updateState(next);
    setTimeout(() => advanceRound(next), REVEAL_PAUSE_MS);
  }

  function advanceRound(prev: PublicState) {
    const nextRoundIndex = prev.round; // round is 1-indexed, so this is the next round's 0-index
    if (nextRoundIndex >= prev.totalRounds) {
      updateState({ ...prev, phase: "game-over", currentDrawerId: null, revealedWord: null });
      return;
    }
    const drawer = prev.players[nextRoundIndex % prev.players.length];
    const state: PublicState = {
      ...prev,
      phase: "drawing",
      currentDrawerId: drawer.sessionId,
      wordLength: null,
      roundStartedAt: Date.now(),
      revealedWord: null,
      lastOutcome: null,
      lastElapsedMs: null,
      round: nextRoundIndex + 1,
    };
    setLocalWord(null);
    assignWord(drawer.sessionId, state);
    updateState(state);
  }

  function playAgain() {
    startGame();
  }

  function applyGotIt(current: PublicState, drawerId: string) {
    if (current.phase !== "drawing" || current.currentDrawerId !== drawerId) return;
    endRound(current, "solved");
  }

  function applySkip(current: PublicState, drawerId: string) {
    if (current.phase !== "drawing" || current.currentDrawerId !== drawerId) return;
    endRound(current, "skipped");
  }

  // Wire up incoming messages the shared host-state hook doesn't already handle.
  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type === "word") {
        setLocalWord((payload as WordPayload).word);
        return;
      }
      if (type === "request-state") {
        // The generic host-state resync doesn't know about the secret word;
        // re-send it if the requester is the current drawer reconnecting.
        if (isHost && hostWordRef.current && publicState?.currentDrawerId === senderId) {
          send("word", { word: hostWordRef.current }, senderId);
        }
        return;
      }
      if (type === "stroke") {
        canvasRef.current?.applyRemoteBatch(payload as StrokeBatch);
        return;
      }
      if (type === "clear") {
        canvasRef.current?.clear();
        return;
      }
      if (!isHost || !publicState) return;
      if (type === "got-it") {
        applyGotIt(publicState, senderId);
        return;
      }
      if (type === "skip") {
        applySkip(publicState, senderId);
        return;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, publicState, isHost]);

  // Reset the canvas whenever a new round starts (fresh drawer, fresh word).
  useEffect(() => {
    if (publicState?.phase === "drawing") {
      canvasRef.current?.clear();
    }
  }, [publicState?.round, publicState?.phase]);

  // Announce round-end / game-over into the log.
  const lastAnnouncedPhaseKey = useRef<string | null>(null);
  useEffect(() => {
    if (!publicState) return;
    const key = `${publicState.round}-${publicState.phase}`;
    if (lastAnnouncedPhaseKey.current === key) return;
    lastAnnouncedPhaseKey.current = key;
    if (publicState.phase === "round-end" && publicState.revealedWord) {
      if (publicState.lastOutcome === "solved") {
        pushFeed(
          `Got it in ${formatDuration(publicState.lastElapsedMs ?? 0)}! The word was "${publicState.revealedWord}".`
        );
      } else {
        pushFeed(`Skipped — the word was "${publicState.revealedWord}".`);
      }
    }
    if (publicState.phase === "game-over") {
      pushFeed("Game over! Final scores below.");
    }
  }, [publicState]);

  // Stopwatch counting up — there's no time limit, this is just a live readout.
  useEffect(() => {
    if (!publicState?.roundStartedAt) {
      setElapsedSeconds(0);
      return;
    }
    const tick = () => setElapsedSeconds(Math.max(0, Math.round((Date.now() - publicState.roundStartedAt!) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [publicState?.roundStartedAt]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [feed]);

  const isDrawer =
    publicState?.phase === "drawing" && publicState.currentDrawerId === localSessionId;

  const drawerName = useMemo(() => {
    if (!publicState?.currentDrawerId) return null;
    return publicState.players.find((p) => p.sessionId === publicState.currentDrawerId)?.name ?? null;
  }, [publicState]);

  function handleLocalStroke(batch: StrokeBatch) {
    send("stroke", batch);
  }

  function handleClearClick() {
    canvasRef.current?.clear();
    send("clear", {});
  }

  function handleGotIt() {
    if (!publicState || !isDrawer) return;
    // Broadcasts don't loop back to their own sender, so apply directly if
    // I'm the host — same pattern as every other host-authoritative action.
    if (isHost) applyGotIt(publicState, localSessionId ?? "");
    else send("got-it", {});
  }

  function handleSkip() {
    if (!publicState || !isDrawer) return;
    if (isHost) applySkip(publicState, localSessionId ?? "");
    else send("skip", {});
  }

  const finalStats = useMemo(() => {
    if (!publicState) return [];
    return publicState.players
      .map((p) => {
        const s = publicState.stats[p.sessionId] ?? { solved: 0, skipped: 0, totalMs: 0 };
        return { ...p, ...s, avgMs: s.solved > 0 ? s.totalMs / s.solved : null };
      })
      .sort((a, b) => (a.skipped !== b.skipped ? a.skipped - b.skipped : a.totalMs - b.totalMs));
  }, [publicState]);

  if (!publicState) {
    return (
      <div className="dg-lobby">
        <h2>🎨 Draw &amp; Guess</h2>
        <p>
          {`Charades with a pen: draw a secret word while everyone else calls out guesses out loud. ${PICTURES_PER_PLAYER} pictures each, no time limit — the fastest drawer to get their pictures guessed wins.`}
        </p>
        {presentPlayers.length < 2 ? (
          <p className="dg-hint">Need at least 2 people to have this game open.</p>
        ) : (
          <p className="dg-hint">
            {presentPlayers.length} people ready. Whoever starts runs the first game.
          </p>
        )}
        <button
          className="primary-button"
          onClick={startGame}
          disabled={presentPlayers.length < 2}
        >
          Start game
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (publicState.phase === "game-over") {
    const [first, second] = finalStats;
    const tie = !!second && first.skipped === second.skipped && first.totalMs === second.totalMs;
    return (
      <div className="dg-lobby">
        <h2>{tie ? "🤝 It's a tie!" : `🏆 ${first?.name ?? "Someone"} was the fastest drawer!`}</h2>
        <p className="dg-hint">Ranked by fewest skips, then fastest total guess time.</p>
        <ol className="dg-scoreboard">
          {finalStats.map((p) => (
            <li key={p.sessionId} className="dg-scoreboard-row">
              <span>{p.name}</span>
              <span>
                {p.solved}/{PICTURES_PER_PLAYER} solved
                {p.skipped > 0 ? `, ${p.skipped} skipped` : ""} · {formatDuration(p.totalMs)} total
                {p.avgMs != null ? ` (avg ${formatDuration(p.avgMs)})` : ""}
              </span>
            </li>
          ))}
        </ol>
        <button className="primary-button" onClick={playAgain} disabled={presentPlayers.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const wordBlanks =
    publicState.phase === "round-end"
      ? publicState.revealedWord ?? ""
      : "_ ".repeat(publicState.wordLength ?? 0).trim();

  return (
    <div className="draw-guess-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="dg-status">
          {isDrawer ? (
            <span className="dg-word dg-word--secret">Draw: {localWord}</span>
          ) : (
            <span className="dg-word">
              {drawerName ? `${drawerName} is drawing` : "Round over"} · {wordBlanks}
            </span>
          )}
        </div>
        <span className="dg-timer">{publicState.phase === "drawing" ? formatDuration(elapsedSeconds * 1000) : ""}</span>
      </div>

      <p className="dg-round-hint">
        Picture {publicState.round} of {publicState.totalRounds}
        {!isDrawer && publicState.phase === "drawing" ? " — call out your guess!" : ""}
      </p>

      <div className="dg-canvas-wrap">
        <DrawCanvas ref={canvasRef} interactive={isDrawer} onLocalBatch={handleLocalStroke} />
        {isDrawer && (
          <button className="dg-clear-button" onClick={handleClearClick}>
            Clear
          </button>
        )}
      </div>

      {isDrawer && publicState.phase === "drawing" && (
        <div className="dg-drawer-controls">
          <button className="link-button dg-skip-button" onClick={handleSkip}>
            🙈 Skip
          </button>
          <button className="primary-button dg-gotit-button" onClick={handleGotIt}>
            ✅ Got it!
          </button>
        </div>
      )}

      <div className="dg-guess-feed" ref={feedRef}>
        {feed.map((entry) => (
          <div key={entry.id} className="dg-feed-entry dg-feed-entry--system">
            {entry.text}
          </div>
        ))}
      </div>

      <div className="dg-mini-scoreboard">
        {publicState.players.map((p) => {
          const s = publicState.stats[p.sessionId];
          return (
            <span key={p.sessionId} className="dg-mini-score">
              {p.name}: {s?.solved ?? 0}/{PICTURES_PER_PLAYER}
            </span>
          );
        })}
      </div>
    </div>
  );
}
