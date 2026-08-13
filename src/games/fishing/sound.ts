// Tiny procedurally-generated sound effects via the Web Audio API — no
// audio files to ship or load. A single AudioContext is reused and resumed
// lazily on first use, since browsers require a user gesture to start one
// (a catch tap counts).
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playSplash() {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(650, t0);
  o.frequency.exponentialRampToValueAtTime(140, t0 + 0.18);
  g.gain.setValueAtTime(0.001, t0);
  g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + 0.25);
}

export function playGoldChime() {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [880, 1174.66].forEach((freq, i) => {
    const start = t0 + i * 0.08;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.001, start);
    g.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(start);
    o.stop(start + 0.3);
  });
}
