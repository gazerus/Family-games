import { useEffect, useLayoutEffect, useRef } from "react";
import { NORTH, EAST, SOUTH, WEST, type Cell, type Maze, type PowerUp } from "./maze";
import { ACTIVE_THEME } from "./theme";

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function MazePanel({
  maze,
  powerUps,
  collectedKeys,
  path,
  trail,
  color,
  initial,
  targetCell,
  revealActive,
  mine,
  label,
}: {
  maze: Maze;
  powerUps: PowerUp[];
  collectedKeys: Set<string>;
  path: Cell[];
  trail: Cell[];
  color: string;
  initial: string;
  targetCell: Cell;
  revealActive: boolean;
  mine: boolean;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animPos = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze, powerUps, trail, targetCell, revealActive, collectedKeys]);

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || canvas.width === 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const cellW = w / maze.width;
    const cellH = h / maze.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ACTIVE_THEME.floor;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ACTIVE_THEME.exit;
    ctx.globalAlpha = 0.4;
    ctx.fillRect((maze.width - 1) * cellW, (maze.height - 1) * cellH, cellW, cellH);
    ctx.globalAlpha = 1;

    if (revealActive) {
      const idx = path.findIndex((c) => c.row === targetCell.row && c.col === targetCell.col);
      if (idx >= 0) {
        ctx.fillStyle = "#fef08a";
        ctx.globalAlpha = 0.55;
        for (let i = idx + 1; i <= idx + 3 && i < path.length; i++) {
          ctx.fillRect(path[i].col * cellW, path[i].row * cellH, cellW, cellH);
        }
        ctx.globalAlpha = 1;
      }
    }

    for (let i = 0; i < trail.length; i++) {
      const cell = trail[i];
      ctx.fillStyle = color;
      ctx.globalAlpha = ((i + 1) / trail.length) * 0.3;
      ctx.beginPath();
      ctx.arc(
        cell.col * cellW + cellW / 2,
        cell.row * cellH + cellH / 2,
        Math.min(cellW, cellH) * 0.16,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = ACTIVE_THEME.wall;
    ctx.lineWidth = Math.max(2, Math.min(cellW, cellH) * 0.08);
    ctx.lineCap = "round";
    for (let r = 0; r < maze.height; r++) {
      for (let c = 0; c < maze.width; c++) {
        const open = maze.open[r][c];
        const x0 = c * cellW;
        const y0 = r * cellH;
        const x1 = x0 + cellW;
        const y1 = y0 + cellH;
        if (!(open & NORTH)) line(ctx, x0, y0, x1, y0);
        if (!(open & WEST)) line(ctx, x0, y0, x0, y1);
        if (r === maze.height - 1 && !(open & SOUTH)) line(ctx, x0, y1, x1, y1);
        if (c === maze.width - 1 && !(open & EAST)) line(ctx, x1, y0, x1, y1);
      }
    }

    ctx.font = `${Math.min(cellW, cellH) * 0.55}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const pu of powerUps) {
      if (collectedKeys.has(`${pu.row},${pu.col}`)) continue;
      ctx.fillText(pu.kind === "speed" ? "⚡" : "👁️", pu.col * cellW + cellW / 2, pu.row * cellH + cellH / 2);
    }

    const targetX = targetCell.col * cellW + cellW / 2;
    const targetY = targetCell.row * cellH + cellH / 2;
    if (!animPos.current) animPos.current = { x: targetX, y: targetY };
    animPos.current.x += (targetX - animPos.current.x) * 0.3;
    animPos.current.y += (targetY - animPos.current.y) * 0.3;

    const radius = Math.min(cellW, cellH) * 0.32;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(animPos.current.x, animPos.current.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${radius}px sans-serif`;
    ctx.fillText(initial, animPos.current.x, animPos.current.y + 1);
  }

  return (
    <div className={`mz-panel-wrap ${mine ? "mz-panel-wrap--mine" : "mz-panel-wrap--theirs"}`}>
      <div className="mz-panel-label">{label}</div>
      <canvas ref={canvasRef} className="mz-canvas" style={{ aspectRatio: `${maze.width} / ${maze.height}` }} />
    </div>
  );
}
