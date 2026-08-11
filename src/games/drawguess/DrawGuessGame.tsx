import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { pickRandomWord } from "./words";
import { DrawCanvas } from "./DrawCanvas";
import type { DrawCanvasHandle, StrokeBatch } from "./DrawCanvas";

const GAME_ID = "draw-guess";
const ROUND_MS = 60_000;
const REVEAL_PAUSE_MS = 4_500;

type Phase = "drawing" | "round-end" | "game-over";

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: Phase;
  hostId: string;
  hostName: string;
  players: PublicPlayer[];
  scores: Record<string, number>;
  currentDrawerId: string | null;
  wordLength: number | null;
  roundEndsAt: number | null;
  revealedWord: string | null;
  lastCorrectGuesserId: string | null;
  round: number;
}

interface WordPayload {
  word: string;
}

interface GuessPayload {
  text: string;
}

type DrawGuessPayload =
  | PublicState
  | WordPayload
  | GuessPayload
  | StrokeBatch
  | Record<string, never>;

interface FeedEntry {
  id: string;
  kind: "guess" | "system";
  text: string;
  sender?: string;
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
    participants,
  } = useHostGameState<PublicState, DrawGuessPayload>(GAME_ID, "game-over");

  const [localWord, setLocalWord] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [guessDraft, setGuessDraft] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const canvasRef = useRef<DrawCanvasHandle>(null);
  const hostWordRef = useRef<string | null>(null);
  const usedWordsRef = useRef(new Set<string>());
  const roundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  function pushFeed(entry: Omit<FeedEntry, "id">) {
    setFeed((prev) => [...prev, { ...entry, id: `${Date.now()}-${Math.random()}` }]);
  }

  function clearRoundTimeout() {
    if (roundTimeoutRef.current) {
      clearTimeout(roundTimeoutRef.current);
      roundTimeoutRef.current = null;
    }
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
    const order = participants.map((p) => ({
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
      scores: Object.fromEntries(order.map((p) => [p.sessionId, 0])),
      currentDrawerId: order[0].sessionId,
      wordLength: null,
      roundEndsAt: Date.now() + ROUND_MS,
      revealedWord: null,
      lastCorrectGuesserId: null,
      round: 1,
    };
    assignWord(order[0].sessionId, state);
    startAsHost(state);
    clearRoundTimeout();
    roundTimeoutRef.current = setTimeout(() => endRound(state, "timeout"), ROUND_MS);
  }

  function endRound(state: PublicState, reason: "timeout" | "correct", guesserId?: string) {
    clearRoundTimeout();
    const next: PublicState = {
      ...state,
      phase: "round-end",
      revealedWord: hostWordRef.current,
      roundEndsAt: null,
      lastCorrectGuesserId: reason === "correct" ? guesserId ?? null : null,
    };
    updateState(next);
    setTimeout(() => advanceRound(next), REVEAL_PAUSE_MS);
  }

  function advanceRound(prev: PublicState) {
    const nextRoundIndex = prev.round; // players are 0-indexed, round is 1-indexed
    if (nextRoundIndex >= prev.players.length) {
      updateState({ ...prev, phase: "game-over", currentDrawerId: null, revealedWord: null });
      return;
    }
    const drawer = prev.players[nextRoundIndex];
    const state: PublicState = {
      ...prev,
      phase: "drawing",
      currentDrawerId: drawer.sessionId,
      wordLength: null,
      roundEndsAt: Date.now() + ROUND_MS,
      revealedWord: null,
      lastCorrectGuesserId: null,
      round: nextRoundIndex + 1,
    };
    setLocalWord(null);
    assignWord(drawer.sessionId, state);
    updateState(state);
    clearRoundTimeout();
    roundTimeoutRef.current = setTimeout(() => endRound(state, "timeout"), ROUND_MS);
  }

  function playAgain() {
    startGame();
  }

  // Wire up incoming messages the shared host-state hook doesn't already handle.
  useEffect(() => {
    return onMessage((type, payload, senderId, sender) => {
      if (type === "word") {
        setLocalWord((payload as WordPayload).word);
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
      if (type === "guess") {
        const text = (payload as GuessPayload).text;
        pushFeed({ kind: "guess", text, sender });
        if (isHost && publicState?.phase === "drawing" && hostWordRef.current) {
          const correct = text.trim().toLowerCase() === hostWordRef.current.toLowerCase();
          if (correct) {
            const state = publicState;
            const scores = { ...state.scores, [senderId]: (state.scores[senderId] ?? 0) + 1 };
            endRound({ ...state, scores }, "correct", senderId);
          }
        }
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

  // Announce round-end / game-over into the feed.
  const lastAnnouncedPhaseKey = useRef<string | null>(null);
  useEffect(() => {
    if (!publicState) return;
    const key = `${publicState.round}-${publicState.phase}`;
    if (lastAnnouncedPhaseKey.current === key) return;
    lastAnnouncedPhaseKey.current = key;
    if (publicState.phase === "round-end" && publicState.revealedWord) {
      const guesser = publicState.players.find(
        (p) => p.sessionId === publicState.lastCorrectGuesserId
      );
      pushFeed({
        kind: "system",
        text: guesser
          ? `${guesser.name} got it! The word was "${publicState.revealedWord}".`
          : `Time's up! The word was "${publicState.revealedWord}".`,
      });
    }
    if (publicState.phase === "game-over") {
      pushFeed({ kind: "system", text: "Game over! Final scores below." });
    }
  }, [publicState]);

  // Countdown display, ticks locally for everyone.
  useEffect(() => {
    if (!publicState?.roundEndsAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.round((publicState.roundEndsAt! - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [publicState?.roundEndsAt]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [feed]);

  useEffect(() => clearRoundTimeout, []);

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

  function handleGuessSubmit(e: FormEvent) {
    e.preventDefault();
    const text = guessDraft.trim();
    if (!text) return;
    pushFeed({ kind: "guess", text, sender: localName });
    send("guess", { text });
    setGuessDraft("");
  }

  const scoreboard = useMemo(() => {
    if (!publicState) return [];
    return publicState.players
      .map((p) => ({ ...p, score: publicState.scores[p.sessionId] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }, [publicState]);

  if (!publicState) {
    return (
      <div className="dg-lobby">
        <h2>🎨 Draw &amp; Guess</h2>
        <p>Take turns drawing a secret word while everyone else guesses.</p>
        {participants.length < 2 ? (
          <p className="dg-hint">Need at least 2 people in the room to play.</p>
        ) : (
          <p className="dg-hint">
            {participants.length} people ready. Whoever starts runs the first game.
          </p>
        )}
        <button
          className="primary-button"
          onClick={startGame}
          disabled={participants.length < 2}
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
    return (
      <div className="dg-lobby">
        <h2>🏆 Game over!</h2>
        <ol className="dg-scoreboard">
          {scoreboard.map((p) => (
            <li key={p.sessionId}>
              <span>{p.name}</span>
              <span>{p.score} pt{p.score === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ol>
        <button className="primary-button" onClick={playAgain} disabled={participants.length < 2}>
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
        <span className="dg-timer">{publicState.phase === "drawing" ? `${secondsLeft}s` : ""}</span>
      </div>

      <div className="dg-canvas-wrap">
        <DrawCanvas ref={canvasRef} interactive={isDrawer} onLocalBatch={handleLocalStroke} />
        {isDrawer && (
          <button className="dg-clear-button" onClick={handleClearClick}>
            Clear
          </button>
        )}
      </div>

      <div className="dg-guess-feed" ref={feedRef}>
        {feed.map((entry) => (
          <div key={entry.id} className={`dg-feed-entry dg-feed-entry--${entry.kind}`}>
            {entry.kind === "guess" ? (
              <>
                <strong>{entry.sender}:</strong> {entry.text}
              </>
            ) : (
              entry.text
            )}
          </div>
        ))}
      </div>

      {!isDrawer && (
        <form className="dg-guess-form" onSubmit={handleGuessSubmit}>
          <input
            type="text"
            value={guessDraft}
            onChange={(e) => setGuessDraft(e.target.value)}
            placeholder="Type your guess…"
            disabled={publicState.phase !== "drawing"}
          />
          <button type="submit" disabled={publicState.phase !== "drawing" || !guessDraft.trim()}>
            Guess
          </button>
        </form>
      )}

      <div className="dg-mini-scoreboard">
        {scoreboard.map((p) => (
          <span key={p.sessionId} className="dg-mini-score">
            {p.name}: {p.score}
          </span>
        ))}
      </div>
    </div>
  );
}
