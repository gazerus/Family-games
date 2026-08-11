import { useCallback, useEffect, useRef, useState } from "react";
import { useGameChannel } from "./useGameChannel";

/**
 * Shared turn-sync protocol for games with no backend: whoever calls
 * `startAsHost` becomes the authority for that game session, computing and
 * broadcasting the single source-of-truth `state` to everyone else. Other
 * clients are pure reflections of the host's broadcasts until the game
 * reaches `gameOverPhase`, at which point anyone can start a new one (and
 * become the new host). Also re-broadcasts state when someone new joins
 * mid-game, so latecomers aren't stuck looking at nothing.
 */
export function useHostGameState<TState extends { phase: string }, TPayload = TState>(
  gameId: string,
  gameOverPhase: string
) {
  const { send, onMessage, participants, localName, localSessionId } =
    useGameChannel<TPayload>(gameId);

  const [hostId, setHostId] = useState<string | null>(null);
  const [state, setState] = useState<TState | null>(null);
  const stateRef = useRef<TState | null>(null);
  const hostIdRef = useRef<string | null>(null);
  stateRef.current = state;
  hostIdRef.current = hostId;

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type !== "state") return;
      const currentHost = hostIdRef.current;
      const currentState = stateRef.current;
      const canAdopt =
        currentHost === null ||
        senderId === currentHost ||
        currentState === null ||
        currentState.phase === gameOverPhase;
      if (!canAdopt) return;
      setHostId(senderId);
      setState(payload as unknown as TState);
    });
  }, [onMessage, gameOverPhase]);

  const isHost = hostId !== null && hostId === localSessionId;

  const startAsHost = useCallback(
    (next: TState) => {
      setHostId(localSessionId);
      setState(next);
      send("state", next as unknown as TPayload);
    },
    [send, localSessionId]
  );

  const updateState = useCallback(
    (next: TState) => {
      setState(next);
      send("state", next as unknown as TPayload);
    },
    [send]
  );

  const participantCount = participants.length;
  useEffect(() => {
    if (isHost && stateRef.current && stateRef.current.phase !== gameOverPhase) {
      send("state", stateRef.current as unknown as TPayload);
    }
    // Only re-sync when the participant count changes, not on every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantCount]);

  return {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    participants,
    localName,
    localSessionId,
  };
}
