import { useEffect, useLayoutEffect, useRef } from "react";
import { FISH_CONFIG, type Difficulty, type FishKind } from "./fish";
import { playGoldChime, playSplash } from "./sound";

interface FishInstance {
  id: number;
  kind: FishKind;
  x: number;
  y: number;
  vx: number;
  size: number;
}

interface Splash {
  x: number;
  y: number;
  startedAt: number;
}

const SPLASH_MS = 500;
const LANES = 4;
const TOP_BAND = 0.22; // fraction of height reserved for the wave strip

export function FishPond({
  difficulty,
  active,
  onCatch,
}: {
  difficulty: Difficulty;
  active: boolean;
  onCatch: (kind: FishKind) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fishRef = useRef<FishInstance[]>([]);
  const splashesRef = useRef<Splash[]>([]);
  const nextIdRef = useRef(0);
  const nextSpawnAtRef = useRef(0);

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
    if (!active) return;
    fishRef.current = [];
    splashesRef.current = [];
    nextSpawnAtRef.current = performance.now() + 300;
    let raf = 0;
    const loop = (now: number) => {
      step(now);
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, difficulty]);

  function spawnFish(w: number, h: number) {
    const cfg = FISH_CONFIG[difficulty];
    const kind: FishKind = Math.random() < cfg.goldChance ? "gold" : "common";
    const size = cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]);
    const speed = cfg.speedRange[0] + Math.random() * (cfg.speedRange[1] - cfg.speedRange[0]);
    const fromLeft = Math.random() < 0.5;
    const lane = Math.floor(Math.random() * LANES);
    const bandTop = h * TOP_BAND;
    const y = bandTop + ((lane + 0.5) / LANES) * (h - bandTop);
    fishRef.current.push({
      id: nextIdRef.current++,
      kind,
      x: fromLeft ? -size : w + size,
      y,
      vx: fromLeft ? speed : -speed,
      size,
    });
  }

  function step(now: number) {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const w = canvas.width;
    const h = canvas.height;

    if (now >= nextSpawnAtRef.current) {
      spawnFish(w, h);
      const [minMs, maxMs] = FISH_CONFIG[difficulty].spawnMsRange;
      nextSpawnAtRef.current = now + minMs + Math.random() * (maxMs - minMs);
    }

    const dt = 1 / 60;
    fishRef.current = fishRef.current
      .map((f) => ({ ...f, x: f.x + f.vx * dt }))
      .filter((f) => f.x > -f.size * 1.5 && f.x < w + f.size * 1.5);

    splashesRef.current = splashesRef.current.filter((s) => now - s.startedAt < SPLASH_MS);
  }

  function draw(now: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || canvas.width === 0) return;
    const w = canvas.width;
    const h = canvas.height;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#38bdf8");
    grad.addColorStop(1, "#0369a1");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Animated sine-wave water line near the top.
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(2, h * 0.012);
    ctx.beginPath();
    const waveY = h * (TOP_BAND * 0.4);
    const amp = h * 0.02;
    const freq = 0.02;
    const speed = now / 400;
    for (let x = 0; x <= w; x += 6) {
      const y = waveY + Math.sin(x * freq + speed) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of fishRef.current) {
      ctx.save();
      ctx.translate(f.x, f.y);
      if (f.vx < 0) ctx.scale(-1, 1);
      ctx.font = `${f.size}px sans-serif`;
      ctx.fillText(f.kind === "gold" ? "🐠" : "🐟", 0, 0);
      ctx.restore();
    }

    for (const s of splashesRef.current) {
      const age = (now - s.startedAt) / SPLASH_MS;
      ctx.strokeStyle = `rgba(255,255,255,${1 - age})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10 + age * 40, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * ratio;
    const y = (e.clientY - rect.top) * ratio;
    const idx = fishRef.current.findIndex((f) => Math.hypot(f.x - x, f.y - y) < f.size * 0.75);
    if (idx === -1) return;
    const fish = fishRef.current[idx];
    fishRef.current = fishRef.current.filter((f) => f.id !== fish.id);
    splashesRef.current.push({ x: fish.x, y: fish.y, startedAt: performance.now() });
    if (fish.kind === "gold") playGoldChime();
    else playSplash();
    onCatch(fish.kind);
  }

  return <canvas ref={canvasRef} className="fc-canvas" onPointerDown={handlePointerDown} />;
}
