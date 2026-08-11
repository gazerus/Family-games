import { useCallback, useEffect, useRef } from "react";
import { useCall } from "../call/CallContext";
import type { GameAppMessage } from "../types";

/**
 * Scopes the shared Daily data channel to a single game's messages, so
 * game components don't need to filter kind/gameId themselves.
 */
export function useGameChannel<TPayload = unknown>(gameId: string) {
  const { sendAppMessage, onAppMessage, localName, localSessionId, participants } =
    useCall();
  const handlersRef = useRef(new Set<(type: string, payload: TPayload, senderId: string, sender: string) => void>());

  useEffect(() => {
    return onAppMessage((data) => {
      if (data.kind !== "game" || data.gameId !== gameId) return;
      const msg = data as GameAppMessage<TPayload>;
      for (const handler of handlersRef.current) {
        handler(msg.type, msg.payload, msg.senderId, msg.sender);
      }
    });
  }, [onAppMessage, gameId]);

  const send = useCallback(
    (type: string, payload: TPayload, target: string = "*") => {
      sendAppMessage(
        {
          kind: "game",
          gameId,
          type,
          payload,
          sender: localName,
          senderId: localSessionId ?? "",
        },
        target
      );
    },
    [sendAppMessage, gameId, localName, localSessionId]
  );

  const onMessage = useCallback(
    (handler: (type: string, payload: TPayload, senderId: string, sender: string) => void) => {
      handlersRef.current.add(handler);
      return () => {
        handlersRef.current.delete(handler);
      };
    },
    []
  );

  return { send, onMessage, localName, localSessionId, participants };
}
