import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface StrokeBatch {
  strokeId: string;
  points: { x: number; y: number }[];
  start: boolean;
}

// Diagnostic-only: add ?dgDebug=1 to the URL to see the canvas's real DOM
// bounds (red outline) plus live rect/bitmap/pointer readouts, to track
// down reports of dead zones that don't register touches. Inert otherwise.
const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dgDebug") === "1";

export interface DrawCanvasHandle {
  clear: () => void;
  applyRemoteBatch: (batch: StrokeBatch) => void;
}

const STROKE_COLOR = "#2b2b2b";
const STROKE_WIDTH = 4;

function drawBatch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  batch: StrokeBatch
) {
  if (batch.points.length === 0) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.beginPath();
  const first = batch.points[0];
  if (batch.start) {
    ctx.moveTo(first.x * width, first.y * height);
  } else {
    ctx.moveTo(first.x * width, first.y * height);
  }
  for (const pt of batch.points) {
    ctx.lineTo(pt.x * width, pt.y * height);
  }
  ctx.stroke();
}

export const DrawCanvas = forwardRef<
  DrawCanvasHandle,
  {
    interactive: boolean;
    onLocalBatch?: (batch: StrokeBatch) => void;
  }
>(function DrawCanvas({ interactive, onLocalBatch }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const strokeIdRef = useRef<string | null>(null);
  const bufferRef = useRef<{ x: number; y: number }[]>([]);
  const sentFirstBatchRef = useRef(false);
  const moveCountRef = useRef(0);
  const [debugInfo, setDebugInfo] = useState<Record<string, string | number>>({});

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    applyRemoteBatch: (batch) => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      drawBatch(ctx, canvas.width, canvas.height, batch);
    },
  }));

  // Keep the backing bitmap sized to the element's rendered box for crisp lines.
  // Mobile browsers resize the visual viewport mid-gesture (address bar
  // collapsing on first touch, layout still settling right after the game
  // screen mounts), which fires this more than once. Resizing a canvas's
  // width/height always wipes its bitmap, so a resize landing mid-stroke
  // used to erase what was already drawn and leave the touch coordinates
  // mapped against a stale, undersized bitmap until the next observer tick
  // — that's what showed up as gaps/dashes and a "dead" bottom half. Guard
  // against no-op resizes and carry the existing drawing across real ones.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();

      if (DEBUG) {
        setDebugInfo((prev) => ({
          ...prev,
          rectW: rect.width.toFixed(1),
          rectH: rect.height.toFixed(1),
          rectTop: rect.top.toFixed(1),
          rectLeft: rect.left.toFixed(1),
          rectBottom: rect.bottom.toFixed(1),
          bitmapW: canvas.width,
          bitmapH: canvas.height,
        }));
      }

      if (rect.width === 0 || rect.height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      const newWidth = Math.max(1, Math.round(rect.width * ratio));
      const newHeight = Math.max(1, Math.round(rect.height * ratio));
      if (newWidth === canvas.width && newHeight === canvas.height) return;

      let snapshot: HTMLCanvasElement | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
      }

      canvas.width = newWidth;
      canvas.height = newHeight;

      if (snapshot) {
        getCtx()?.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, newWidth, newHeight);
      }

      if (DEBUG) {
        setDebugInfo((prev) => ({ ...prev, bitmapW: newWidth, bitmapH: newHeight, dpr: ratio }));
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [getCtx]);

  function pointFromClient(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  function relativePoint(e: React.PointerEvent<HTMLCanvasElement>) {
    return pointFromClient(e.clientX, e.clientY);
  }

  function flush(finalStart: boolean) {
    if (bufferRef.current.length === 0 || !strokeIdRef.current) return;
    onLocalBatch?.({
      strokeId: strokeIdRef.current,
      points: bufferRef.current,
      start: finalStart,
    });
    bufferRef.current = [];
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactive) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const pt = relativePoint(e);
    drawingRef.current = true;
    strokeIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    bufferRef.current = [pt];
    sentFirstBatchRef.current = false;
    moveCountRef.current = 0;
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      drawBatch(ctx, canvas.width, canvas.height, {
        strokeId: strokeIdRef.current,
        points: [pt, pt],
        start: true,
      });
    }
    if (DEBUG) {
      setDebugInfo((prev) => ({
        ...prev,
        downTarget: (e.target as Element).tagName,
        downClientX: e.clientX.toFixed(0),
        downClientY: e.clientY.toFixed(0),
        downFx: pt.x.toFixed(3),
        downFy: pt.y.toFixed(3),
        moveCount: 0,
      }));
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactive || !drawingRef.current) return;
    const ctx = getCtx();
    const canvas = canvasRef.current;

    // Mobile browsers dispatch pointermove roughly once per frame, batching
    // several real touch samples into it. Reading only e.clientX/Y drops the
    // in-between samples and leaves visible gaps on fast strokes — walk the
    // coalesced list instead so every sample gets drawn.
    const native = e.nativeEvent;
    const samples =
      typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const points = (samples.length > 0 ? samples : [native]).map((ev) =>
      pointFromClient(ev.clientX, ev.clientY)
    );

    for (const pt of points) {
      const prev = bufferRef.current[bufferRef.current.length - 1];
      if (ctx && canvas && prev) {
        drawBatch(ctx, canvas.width, canvas.height, {
          strokeId: strokeIdRef.current!,
          points: [prev, pt],
          start: false,
        });
      }
      bufferRef.current.push(pt);
    }
    moveCountRef.current += points.length;
    if (DEBUG) {
      const lastPt = points[points.length - 1];
      setDebugInfo((prev) => ({
        ...prev,
        moveCount: moveCountRef.current,
        moveClientX: e.clientX.toFixed(0),
        moveClientY: e.clientY.toFixed(0),
        moveFx: lastPt.x.toFixed(3),
        moveFy: lastPt.y.toFixed(3),
      }));
    }
    if (bufferRef.current.length >= 8) {
      flush(!sentFirstBatchRef.current);
      sentFirstBatchRef.current = true;
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactive || !drawingRef.current) return;
    drawingRef.current = false;
    flush(!sentFirstBatchRef.current);
    strokeIdRef.current = null;
    if (DEBUG) {
      setDebugInfo((prev) => ({
        ...prev,
        upClientX: e.clientX.toFixed(0),
        upClientY: e.clientY.toFixed(0),
        totalMoves: moveCountRef.current,
      }));
    }
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`draw-canvas ${interactive ? "draw-canvas--interactive" : ""}`}
        style={DEBUG ? { outline: "2px solid #ff0000", outlineOffset: "-2px" } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      {DEBUG && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(0,0,0,0.85)",
            color: "#4ade80",
            fontSize: 10,
            fontFamily: "monospace",
            padding: "6px 8px",
            zIndex: 9999,
            lineHeight: 1.5,
            maxHeight: "40vh",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            pointerEvents: "none",
          }}
        >
          {Object.entries(debugInfo)
            .map(([k, v]) => `${k}: ${v}`)
            .join("  |  ")}
        </div>
      )}
    </>
  );
});
