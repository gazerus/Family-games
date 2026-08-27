import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CallContext } from "../call/CallContext";
import type { CallContextValue, JoinState } from "../call/CallContext";
import type { AppMessage, ParticipantTile } from "../types";
import { createTestBus, type TestBusHandle, type TestBusMessage } from "./testBus";

/**
 * Drop-in replacement for CallProvider used by test mode: same context, same
 * shape, but backed by the in-page test bus instead of a real Daily call.
 * Everything downstream (the tabs, the games, useGameChannel) is unchanged
 * and unaware.
 *
 * What it does faithfully: app messages (broadcast and targeted), the
 * participant roster growing and shrinking as players are added, removed,
 * leave, and rejoin. What it can't do: real video and audio — there's no
 * camera capture here, so every tile falls back to the same initial-letter
 * placeholder a real participant shows with their camera off, and mic /
 * camera buttons only flip their own state.
 */

/** Presence chatter, kept on its own envelope so it never reaches game code. */
type Envelope =
  | { kind: "test-presence"; type: "hello" | "here" | "bye"; name: string }
  | { kind: "test-app"; message: AppMessage };

interface RosterEntry {
  id: string;
  name: string;
}

export function FakeCallProvider({
  userId,
  name,
  onActivity,
  children,
}: {
  userId: string;
  name: string;
  /** Fires when a game message lands, so an inactive player's chip can flag it. */
  onActivity?: () => void;
  children: ReactNode;
}) {
  const busRef = useRef<TestBusHandle | null>(null);
  const listenersRef = useRef(new Set<(data: AppMessage) => void>());
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;
  const nameRef = useRef(name);
  nameRef.current = name;

  const [joinState, setJoinState] = useState<JoinState>("joined");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (joinState === "left") return;

    const bus = createTestBus(userId, (msg: TestBusMessage) => {
      const envelope = msg.data as Envelope;
      if (envelope.kind === "test-presence") {
        if (envelope.type === "bye") {
          setRoster((prev) => prev.filter((r) => r.id !== msg.from));
          return;
        }
        setRoster((prev) => {
          const existing = prev.find((r) => r.id === msg.from);
          if (existing && existing.name === envelope.name) return prev;
          const without = prev.filter((r) => r.id !== msg.from);
          return [...without, { id: msg.from, name: envelope.name }];
        });
        // A broadcast "hello" is someone arriving and asking who's here;
        // answer privately so they learn about me without another round.
        if (envelope.type === "hello") {
          bus.post(msg.from, {
            kind: "test-presence",
            type: "here",
            name: nameRef.current,
          } satisfies Envelope);
        }
        return;
      }

      if (envelope.kind !== "test-app") return;
      const data = envelope.message;
      // Games chat constantly to keep in sync (see useHostGameState); only a
      // real move or state change is worth flagging on a chip.
      const isChatter =
        data.kind === "game" &&
        (data.type === "here" ||
          data.type === "here-ack" ||
          data.type === "leaving" ||
          data.type === "request-state");
      if (!isChatter) activityRef.current?.();
      for (const handler of listenersRef.current) handler(data);
    });

    busRef.current = bus;
    bus.post("*", { kind: "test-presence", type: "hello", name: nameRef.current } satisfies Envelope);

    const sayBye = () => {
      bus.post("*", { kind: "test-presence", type: "bye", name: nameRef.current } satisfies Envelope);
    };
    // A closed tab never runs cleanup, so tell everyone on the way out —
    // but only when the page is really going away. Being put in the
    // back/forward cache (or backgrounded on a phone) also fires pagehide,
    // and dropping everyone then would leave an empty room on return.
    const handlePageHide = (ev: PageTransitionEvent) => {
      if (!ev.persisted) sayBye();
    };
    const handlePageShow = () => {
      bus.post("*", { kind: "test-presence", type: "hello", name: nameRef.current } satisfies Envelope);
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      sayBye();
      bus.close();
      busRef.current = null;
      setRoster([]);
    };
  }, [userId, joinState, attempt]);

  // Renaming isn't in the UI today, but if it ever is, everyone else's
  // roster should follow along rather than keep the stale label.
  useEffect(() => {
    busRef.current?.post("*", { kind: "test-presence", type: "here", name } satisfies Envelope);
  }, [name]);

  const toggleMic = useCallback(() => setMicOn((v) => !v), []);
  const toggleCamera = useCallback(() => setCameraOn((v) => !v), []);

  const leave = useCallback(() => setJoinState("left"), []);

  const rejoin = useCallback(() => {
    setJoinState("joined");
    setAttempt((a) => a + 1);
  }, []);

  const removeParticipant = useCallback((sessionId: string) => {
    setDismissedIds((prev) => new Set(prev).add(sessionId));
  }, []);

  const sendAppMessage = useCallback((data: AppMessage, target: string = "*") => {
    busRef.current?.post(target, { kind: "test-app", message: data } satisfies Envelope);
  }, []);

  const onAppMessage = useCallback((handler: (data: AppMessage) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const participants: ParticipantTile[] = useMemo(() => {
    if (joinState !== "joined") return [];
    const tiles: ParticipantTile[] = [
      { sessionId: userId, userName: name, isLocal: true, videoTrack: null, audioTrack: null },
      ...roster.map((r) => ({
        sessionId: r.id,
        userName: r.name,
        isLocal: false,
        videoTrack: null,
        audioTrack: null,
      })),
    ];
    return tiles.filter((p) => !dismissedIds.has(p.sessionId));
  }, [joinState, userId, name, roster, dismissedIds]);

  const value: CallContextValue = {
    joinState,
    errorMessage: null,
    localName: name,
    localSessionId: joinState === "joined" ? userId : null,
    participants,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    leave,
    rejoin,
    removeParticipant,
    sendAppMessage,
    onAppMessage,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
