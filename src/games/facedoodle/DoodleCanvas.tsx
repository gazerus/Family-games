import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

export interface Sticker {
  id: string;
  emoji: string;
  x: number; // relative 0..1, canvas-space
  y: number; // relative 0..1, canvas-space
}

export interface DoodleCanvasHandle {
  exportImage: (mimeType: string, quality: number) => string;
}

// Keep in sync with .fd-sticker's font-size in App.css.
const STICKER_CSS_SIZE = 34;

export const DoodleCanvas = forwardRef<
  DoodleCanvasHandle,
  {
    photo: HTMLCanvasElement;
    penColor: string;
    penSize: number;
    stickers: Sticker[];
    onStickersChange: (stickers: Sticker[]) => void;
  }
>(function DoodleCanvas({ photo, penColor, penSize, stickers, onStickersChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Draw the captured photo as the starting bitmap. Runs once per photo
  // (a fresh capture), sized to the photo's own resolution so pen strokes
  // and stickers land at full quality regardless of on-screen scale.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = photo.width;
    canvas.height = photo.height;
    ctx.drawImage(photo, 0, 0);
  }, [photo]);

  useImperativeHandle(ref, () => ({
    exportImage: (mimeType, quality) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return "";
      // Bake the sticker layer into the bitmap so the exported image is a
      // single flat picture (recipients don't get a live editable overlay).
      // Scaled from the CSS sticker size (see .fd-sticker in App.css) by the
      // canvas's own display-to-backing ratio, so the export matches what
      // was actually on screen rather than a size guessed independently.
      const displayWidth = canvas.getBoundingClientRect().width || canvas.width;
      const stickerPx = STICKER_CSS_SIZE * (canvas.width / displayWidth);
      for (const s of stickers) {
        ctx.font = `${Math.round(stickerPx)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.emoji, s.x * canvas.width, s.y * canvas.height);
      }
      return canvas.toDataURL(mimeType, quality);
    },
  }));

  function relPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelectedId(null);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pt = relPoint(e.clientX, e.clientY);
    drawingRef.current = true;
    lastPointRef.current = pt;
    ctx.fillStyle = penColor;
    ctx.beginPath();
    ctx.arc(pt.x * canvas.width, pt.y * canvas.height, (penSize / 2) * (canvas.width / canvas.getBoundingClientRect().width), 0, Math.PI * 2);
    ctx.fill();
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const native = e.nativeEvent;
    const samples =
      typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const points = (samples.length > 0 ? samples : [native]).map((ev) => relPoint(ev.clientX, ev.clientY));
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const pt of points) {
      const prev = lastPointRef.current;
      if (prev) {
        ctx.beginPath();
        ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height);
        ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
        ctx.stroke();
      }
      lastPointRef.current = pt;
    }
  }

  function handleCanvasPointerUp() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function handleStickerPointerDown(e: React.PointerEvent<HTMLSpanElement>, id: string) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingIdRef.current = id;
    setSelectedId(id);
  }

  function handleStickerPointerMove(e: React.PointerEvent<HTMLSpanElement>) {
    const id = draggingIdRef.current;
    const wrap = wrapRef.current;
    if (!id || !wrap) return;
    e.stopPropagation();
    const rect = wrap.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onStickersChange(stickers.map((s) => (s.id === id ? { ...s, x, y } : s)));
  }

  function handleStickerPointerUp(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation();
    draggingIdRef.current = null;
  }

  function removeSticker(id: string) {
    onStickersChange(stickers.filter((s) => s.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="fd-canvas-wrap">
      {/* Shrink-wraps exactly to the canvas's own rendered box (no
          letterboxing gap), so a sticker's 0..1 position — computed against
          this element in handleStickerPointerMove — lands at the same
          fraction of the actual photo that exportImage() bakes it at. */}
      <div className="fd-canvas-inner" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="fd-canvas"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
        />
        {stickers.map((s) => (
          <span
            key={s.id}
            className="fd-sticker"
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
            onPointerDown={(e) => handleStickerPointerDown(e, s.id)}
            onPointerMove={handleStickerPointerMove}
            onPointerUp={handleStickerPointerUp}
            onPointerCancel={handleStickerPointerUp}
          >
            {s.emoji}
            {selectedId === s.id && (
              <button
                className="fd-sticker__remove"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeSticker(s.id)}
                aria-label="Remove sticker"
              >
                ✕
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
});
