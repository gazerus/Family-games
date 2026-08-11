import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useCall } from "../call/CallContext";
import type { ChatMessage } from "../types";

export function ChatTab() {
  const { joinState, localName, localSessionId, sendAppMessage, onAppMessage } =
    useCall();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onAppMessage((data) => {
      if (data.kind !== "chat") return;
      setMessages((prev) => [
        ...prev,
        { id: data.id, sender: data.sender, text: data.text, ts: data.ts, isLocal: false },
      ]);
    });
  }, [onAppMessage]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const id = `${localSessionId ?? "me"}-${Date.now()}`;
    const ts = Date.now();
    setMessages((prev) => [
      ...prev,
      { id, sender: localName, text, ts, isLocal: true },
    ]);
    sendAppMessage({ kind: "chat", id, text, sender: localName, ts });
    setDraft("");
  }

  return (
    <div className="chat-tab">
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="chat-empty">
            No messages yet — say hi! Messages here only reach family
            currently in the room.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-bubble ${m.isLocal ? "chat-bubble--local" : ""}`}
          >
            {!m.isLocal && <span className="chat-bubble__sender">{m.sender}</span>}
            <span className="chat-bubble__text">{m.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            joinState === "joined" ? "Type a message…" : "Join the room to chat"
          }
          disabled={joinState !== "joined"}
        />
        <button type="submit" disabled={joinState !== "joined" || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
