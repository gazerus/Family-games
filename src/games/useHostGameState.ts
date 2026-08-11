import { useCallback, useEffect, useRef, useState } from "react";
import { useGameChannel } from "./useGameChannel";
import type { ParticipantTile } from "../types";

/**
 * Shared turn-sync protocol for games with no backend: whoever calls
 * `startAsHost` becomes the authority for that game session, computing and
 * broadcasting the single source-of-truth `state` to everyone else. Other
 * clients are pure reflections of the host's broadcasts until the game
 * reaches `gameOverPhase`, at which point anyone can start a new one (and
 * become the new host).
 *
 * A few things that would otherwise desync a purely-broadcast protocol:
 *
 * 1. Re-opening a game screen (switching tabs, going back to the hub and
 *    back in) unmounts and remounts this hook, losing whatever state it had.
 *    On (re)mount it broadcasts a `request-state`; the current host replies
 *    with a fresh `state` so you land in whatever's already happening
 *    instead of an empty "Start game" screen.
 * 2. If two people tap "Start" close enough together that neither has heard
 *    from the other yet, both self-declare host and run divergent games
 *    that end up permanently waiting on each other. `canAdopt` breaks that
 *    tie deterministically (lowest session id wins host), so the loser's
 *    client snaps onto the winner's game instead of staying stuck.
 * 3. Being in the video call is not the same as looking at this game screen
 *    — someone on the Chat tab shouldn't get silently drafted into a game
 *    they never opened. `presentPlayers` tracks who currently has *this*
 *    game screen open (a lightweight `here`/`leaving` handshake, separate
 *    from call membership), so games can gate "Start" on that instead of on
 *    `participants`.
 */
export function useHostGameState<TState extends { phase: string }, TPayload = TState>(
  gameId: string,
  gameOverPhase: string
) {
  const { send, onMessage, participants, localName, localSessionId } =
    useGameChannel<TPayload>(gameId);

  const [hostId, setHostId] = useState<string | null>(null);
  const [state, setState] = useState<TState | null>(null);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const stateRef = useRef<TState | null>(null);
  const hostIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);
  stateRef.current = state;
  hostIdRef.current = hostId;
  isHostRef.current = hostId !== null && hostId === localSessionId;

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type === "request-state") {
        if (isHostRef.current && stateRef.current && stateRef.current.phase !== gameOverPhase) {
          send("state", stateRef.current as unknown as TPayload);
        }
        return;
      }
      if (type === "here") {
        setPresentIds((prev) => (prev.has(senderId) ? prev : new Set(prev).add(senderId)));
        // Reply so the newcomer learns I'm here too, without a full roster protocol.
        send("here", {} as unknown as TPayload, senderId);
        return;
      }
      if (type === "leaving") {
        setPresentIds((prev) => {
          if (!prev.has(senderId)) return prev;
          const next = new Set(prev);
          next.delete(senderId);
          return next;
        });
        return;
      }
      if (type !== "state") return;
      const currentHost = hostIdRef.current;
      const currentState = stateRef.current;
      const canAdopt =
        currentHost === null ||
        senderId === currentHost ||
        currentState === null ||
        currentState.phase === gameOverPhase ||
        senderId < currentHost;
      if (!canAdopt) return;
      setHostId(senderId);
      setState(payload as unknown as TState);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, gameOverPhase, send]);

  // Announce myself once the call has actually joined (so senderId is real),
  // and again ask whoever's hosting to catch me up. On unmount (leaving this
  // game's screen, not necessarily the call), announce that too.
  useEffect(() => {
    if (!localSessionId) return;
    setPresentIds((prev) => (prev.has(localSessionId) ? prev : new Set(prev).add(localSessionId)));
    send("here", {} as unknown as TPayload);
    send("request-state", {} as unknown as TPayload);
    return () => {
      send("leaving", {} as unknown as TPayload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSessionId]);

  const isHost = isHostRef.current;

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
    if (isHostRef.current && stateRef.current && stateRef.current.phase !== gameOverPhase) {
      send("state", stateRef.current as unknown as TPayload);
    }
    // Only re-sync when the participant count changes, not on every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantCount]);

  const presentPlayers: ParticipantTile[] = participants.filter((p) => presentIds.has(p.sessionId));

  return {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    participants,
    presentPlayers,
    localName,
    localSessionId,
  };
}
