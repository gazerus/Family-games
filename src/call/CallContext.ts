import { createContext, useContext } from "react";
import type { AppMessage, ParticipantTile } from "../types";

export type JoinState = "connecting" | "joined" | "left" | "error";

export interface CallContextValue {
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
  removeParticipant: (sessionId: string) => void;
  sendAppMessage: (data: AppMessage, target?: string) => void;
  onAppMessage: (handler: (data: AppMessage) => void) => () => void;
}

/**
 * Two providers fill this in: the real one (CallProvider, backed by Daily)
 * and test mode's stand-in (src/test/FakeCallProvider.tsx). Everything that
 * reads a call through useCall() works unchanged with either.
 */
export const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within a CallProvider");
  return ctx;
}
