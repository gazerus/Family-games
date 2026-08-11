import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface StrokeBatch {
  strokeId: string;
  points: { x: number; y: number }[];
  start: boolean;
}

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
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

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
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      drawBatch(ctx, canvas.width, canvas.height, {
        strokeId: strokeIdRef.current,
        points: [pt, pt],
        start: true,
      });
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
    if (bufferRef.current.length >= 8) {
      flush(!sentFirstBatchRef.current);
      sentFirstBatchRef.current = true;
    }
  }

  function handlePointerUp() {
    if (!interactive || !drawingRef.current) return;
    drawingRef.current = false;
    flush(!sentFirstBatchRef.current);
    strokeIdRef.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`draw-canvas ${interactive ? "draw-canvas--interactive" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
});
