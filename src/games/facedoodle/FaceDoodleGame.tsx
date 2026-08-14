import { useEffect, useRef, useState } from "react";
import { useGameChannel } from "../useGameChannel";
import type { GameProps } from "../types";
import { DoodleCanvas, type DoodleCanvasHandle, type Sticker } from "./DoodleCanvas";

const GAME_ID = "face-doodle";
const MAX_DIM = 480;
const CHUNK_SIZE = 1800;
const EXPORT_MIME = "image/jpeg";
const EXPORT_QUALITY = 0.6;

const STICKER_OPTIONS = ["🎩", "🕶️", "👑", "🥸", "🤡", "😂", "⭐", "❤️", "🦄", "💩"];
const PEN_COLORS = ["#1f2937", "#ef4444", "#3b82f6", "#eab308", "#ec4899", "#22c55e"];
const PEN_SIZES = [4, 9, 16];

type Phase = "idle" | "capturing" | "decorating" | "sent" | "revealed";

interface RevealMetaPayload {
  id: string;
  totalChunks: number;
  fromName: string;
}

interface RevealChunkPayload {
  id: string;
  index: number;
  data: string;
}

type FaceDoodlePayload = RevealMetaPayload | RevealChunkPayload | Record<string, never>;

interface IncomingBuffer {
  total: number;
  fromName: string;
  chunks: Map<number, string>;
}

export function FaceDoodleGame({ onExit }: GameProps) {
  const { send, onMessage, localName, participants } =
    useGameChannel<FaceDoodlePayload>(GAME_ID);

  const [phase, setPhase] = useState<Phase>("idle");
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1]);
  const [sentPreview, setSentPreview] = useState<string | null>(null);
  const [received, setReceived] = useState<{ image: string; fromName: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasHandleRef = useRef<DoodleCanvasHandle>(null);
  const buffersRef = useRef(new Map<string, IncomingBuffer>());
  const pendingRevealRef = useRef<{ image: string; fromName: string } | null>(null);

  const otherPlayer = participants.find((p) => !p.isLocal) ?? null;

  useEffect(() => {
    return onMessage((type, payload) => {
      if (type === "reveal-meta") {
        const meta = payload as RevealMetaPayload;
        buffersRef.current.set(meta.id, { total: meta.totalChunks, fromName: meta.fromName, chunks: new Map() });
        return;
      }
      if (type === "reveal-chunk") {
        const chunk = payload as RevealChunkPayload;
        const buf = buffersRef.current.get(chunk.id);
        if (!buf) return;
        buf.chunks.set(chunk.index, chunk.data);
        if (buf.chunks.size < buf.total) return;
        buffersRef.current.delete(chunk.id);
        const image = Array.from({ length: buf.total }, (_, i) => buf.chunks.get(i) ?? "").join("");
        const result = { image, fromName: buf.fromName };
        setPhase((prev) => {
          if (prev === "decorating") {
            pendingRevealRef.current = result;
            return prev;
          }
          setReceived(result);
          return "revealed";
        });
      }
    });
  }, [onMessage]);

  function startCapture() {
    if (!otherPlayer?.videoTrack) return;
    setPhase("capturing");
  }

  useEffect(() => {
    if (phase !== "capturing" || !otherPlayer?.videoTrack) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = new MediaStream([otherPlayer.videoTrack]);

    let done = false;
    let fallbackTimer: ReturnType<typeof setTimeout>;
    const tryCapture = () => {
      if (done || video.videoWidth === 0) return;
      done = true;
      cleanup();
      const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      const snap = document.createElement("canvas");
      snap.width = w;
      snap.height = h;
      snap.getContext("2d")?.drawImage(video, 0, 0, w, h);
      setPhoto(snap);
      setStickers([]);
      setPhase("decorating");
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", tryCapture);
      video.removeEventListener("loadedmetadata", tryCapture);
      video.removeEventListener("canplay", tryCapture);
      clearTimeout(fallbackTimer);
    };
    video.addEventListener("loadeddata", tryCapture);
    video.addEventListener("loadedmetadata", tryCapture);
    video.addEventListener("canplay", tryCapture);
    tryCapture(); // covers the (rare) case the frame's already ready
    // Camera feeds normally deliver a frame within a couple hundred ms;
    // if it never comes (dropped track, browser quirk), don't leave the
    // button stuck on "Snapping…" forever.
    fallbackTimer = setTimeout(() => {
      if (!done) setPhase("idle");
    }, 5000);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function sendReveal(dataUrl: string) {
    if (!otherPlayer) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const chunks: string[] = [];
    for (let i = 0; i < dataUrl.length; i += CHUNK_SIZE) chunks.push(dataUrl.slice(i, i + CHUNK_SIZE));
    send("reveal-meta", { id, totalChunks: chunks.length, fromName: localName }, otherPlayer.sessionId);
    chunks.forEach((data, index) => {
      setTimeout(() => send("reveal-chunk", { id, index, data }, otherPlayer.sessionId), index * 12);
    });
  }

  function handleDone() {
    const dataUrl = canvasHandleRef.current?.exportImage(EXPORT_MIME, EXPORT_QUALITY);
    if (!dataUrl) return;
    setSentPreview(dataUrl);
    sendReveal(dataUrl);
    setPhase("sent");
  }

  // Leaving the "sent" confirmation is also the moment to surface a reveal
  // that arrived while we were busy decorating our own photo, rather than
  // yanking the in-progress artwork out from under the player mid-edit.
  function backToIdle() {
    setPhoto(null);
    setStickers([]);
    if (pendingRevealRef.current) {
      setReceived(pendingRevealRef.current);
      pendingRevealRef.current = null;
      setPhase("revealed");
    } else {
      setPhase("idle");
    }
  }

  function dismissRevealed() {
    setReceived(null);
    setPhase("idle");
  }

  function addSticker(emoji: string) {
    const jitter = () => 0.4 + Math.random() * 0.2;
    setStickers((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, emoji, x: jitter(), y: jitter() },
    ]);
  }

  if (phase === "revealed" && received) {
    return (
      <div className="dg-lobby">
        <h2>😆 {received.fromName} did something to your photo!</h2>
        <img className="fd-reveal-image" src={received.image} alt={`Doodled photo from ${received.fromName}`} />
        <button className="primary-button" onClick={dismissRevealed}>
          Nice!
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (phase === "sent") {
    return (
      <div className="dg-lobby">
        <h2>📸 Sent!</h2>
        {sentPreview && <img className="fd-reveal-image" src={sentPreview} alt="What you sent" />}
        <p className="dg-hint">{otherPlayer?.userName ?? "They"} will see it any moment.</p>
        <button className="primary-button" onClick={backToIdle}>
          Snap another
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (phase === "decorating" && photo) {
    return (
      <div className="face-doodle-game">
        <div className="dg-header">
          <button className="link-button dg-exit" onClick={onExit}>
            ← Games
          </button>
          <div className="as-turn-banner">Doodle away!</div>
        </div>

        <DoodleCanvas
          ref={canvasHandleRef}
          photo={photo}
          penColor={penColor}
          penSize={penSize}
          stickers={stickers}
          onStickersChange={setStickers}
        />

        <div className="fd-toolbar">
          <div className="fd-tool-row">
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                className={`fd-swatch ${penColor === c ? "fd-swatch--active" : ""}`}
                style={{ background: c }}
                onClick={() => setPenColor(c)}
                aria-label={`Pen colour ${c}`}
              />
            ))}
            {PEN_SIZES.map((s) => (
              <button
                key={s}
                className={`fd-size-btn ${penSize === s ? "fd-size-btn--active" : ""}`}
                onClick={() => setPenSize(s)}
                aria-label={`Brush size ${s}`}
              >
                <span style={{ width: s, height: s }} />
              </button>
            ))}
          </div>
          <div className="fd-tool-row">
            {STICKER_OPTIONS.map((emoji) => (
              <button key={emoji} className="fd-sticker-btn" onClick={() => addSticker(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <button className="primary-button fd-done-button" onClick={handleDone}>
          Send it! 📸
        </button>
      </div>
    );
  }

  return (
    <div className="dg-lobby">
      <h2>📸 Face Doodle</h2>
      <p>Snap a photo of the other person and decorate it with stickers and doodles, then send it back to them!</p>
      <video ref={videoRef} autoPlay playsInline muted style={{ display: "none" }} />
      {!otherPlayer ? (
        <p className="dg-hint">Need someone else in the call to play.</p>
      ) : !otherPlayer.videoTrack ? (
        <p className="dg-hint">{otherPlayer.userName}'s camera is off — ask them to turn it on.</p>
      ) : (
        <p className="dg-hint">Ready when you are.</p>
      )}
      <button
        className="primary-button"
        onClick={startCapture}
        disabled={!otherPlayer?.videoTrack || phase === "capturing"}
      >
        {phase === "capturing" ? "Snapping…" : `📸 Snap ${otherPlayer?.userName ?? "their"} photo`}
      </button>
      <button className="link-button" onClick={onExit}>
        Back to games
      </button>
    </div>
  );
}
