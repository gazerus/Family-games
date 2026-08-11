import Daily, {
  type DailyCall,
  type DailyEventObjectAppMessage,
  type DailyEventObjectFatalError,
} from "@daily-co/daily-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AppMessage, ParticipantTile } from "../types";

export type JoinState = "connecting" | "joined" | "left" | "error";

interface CallContextValue {
  joinState: JoinState;
  errorMessage: string | null;
  localName: string;
  localSessionId: string | null;
  participants: ParticipantTile[];
  micOn: boolean;
  cameraOn: boolean;
  toggleMic: () => void;
  toggleCamera: () => void;
  leave: () => void;
  rejoin: () => void;
  sendAppMessage: (data: AppMessage, target?: string) => void;
  onAppMessage: (handler: (data: AppMessage) => void) => () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

// Module-level because Daily's "one call object per page" rule is global,
// not per-component-instance.
let pendingCallDestroy: Promise<void> | null = null;

function readParticipants(call: DailyCall): ParticipantTile[] {
  const all = call.participants();
  return Object.values(all).map((p) => ({
    sessionId: p.session_id,
    userName: p.user_name || "Family",
    isLocal: p.local,
    videoTrack: p.tracks.video.persistentTrack ?? null,
    audioTrack: p.tracks.audio.persistentTrack ?? null,
  }));
}

export function CallProvider({
  roomUrl,
  name,
  children,
}: {
  roomUrl: string;
  name: string;
  children: ReactNode;
}) {
  const callRef = useRef<DailyCall | null>(null);
  const listenersRef = useRef(new Set<(data: AppMessage) => void>());
  const [joinState, setJoinState] = useState<JoinState>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantTile[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setJoinState("connecting");
    setErrorMessage(null);

    // Daily only allows one live call object per page at a time. React can
    // tear down and re-run this effect back-to-back (StrictMode in dev, or a
    // real remount when the room/name changes), so the previous call's
    // destroy() must finish before creating the next one, or Daily throws
    // "Duplicate DailyIframe instances are not allowed".
    const setup = async () => {
      if (pendingCallDestroy) {
        await pendingCallDestroy;
      }
      if (cancelled) return;

      const call = Daily.createCallObject({
        subscribeToTracksAutomatically: true,
      });
      callRef.current = call;

      const refresh = () => {
        if (cancelled) return;
        setParticipants(readParticipants(call));
      };

      const handleAppMessage = (ev: DailyEventObjectAppMessage) => {
        const data = ev.data as AppMessage;
        for (const handler of listenersRef.current) handler(data);
      };

      const handleError = (ev: DailyEventObjectFatalError) => {
        if (cancelled) return;
        setJoinState("error");
        setErrorMessage(ev.errorMsg || "Something went wrong connecting.");
      };

      call
        .on("participant-joined", refresh)
        .on("participant-updated", refresh)
        .on("participant-left", refresh)
        .on("app-message", handleAppMessage)
        .on("error", handleError)
        .on("left-meeting", () => {
          if (!cancelled) setJoinState("left");
        });

      call
        .join({ url: roomUrl, userName: name })
        .then(() => {
          if (cancelled) return;
          setJoinState("joined");
          setLocalSessionId(call.participants().local.session_id);
          refresh();
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setJoinState("error");
          setErrorMessage(
            err instanceof Error ? err.message : "Couldn't join the room."
          );
        });
    };

    setup();

    return () => {
      cancelled = true;
      const call = callRef.current;
      callRef.current = null;
      if (call) {
        pendingCallDestroy = call.destroy().then(() => {
          pendingCallDestroy = null;
        });
      }
    };
  }, [roomUrl, name, attempt]);

  const toggleMic = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setMicOn((prev) => {
      call.setLocalAudio(!prev);
      return !prev;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setCameraOn((prev) => {
      call.setLocalVideo(!prev);
      return !prev;
    });
  }, []);

  const leave = useCallback(() => {
    callRef.current?.leave();
  }, []);

  const rejoin = useCallback(() => {
    setAttempt((a) => a + 1);
  }, []);

  const sendAppMessage = useCallback((data: AppMessage, target: string = "*") => {
    callRef.current?.sendAppMessage(data, target);
  }, []);

  const onAppMessage = useCallback((handler: (data: AppMessage) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const value: CallContextValue = {
    joinState,
    errorMessage,
    localName: name,
    localSessionId,
    participants,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    leave,
    rejoin,
    sendAppMessage,
    onAppMessage,
  };

  return (
    <CallContext.Provider value={value}>{children}</CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within a CallProvider");
  return ctx;
}
