export const SYMBOL_BANK = [
  "🐶", "🐱", "🐰", "🦊", "🐼", "🐸", "🦁", "🐵",
  "🐷", "🐨", "🐯", "🐮", "🐔", "🐧", "🦉", "🐙",
  "🦋", "🐝", "🐢", "🦄", "🐳", "🐬", "🌟", "🌈",
] as const;

export function pickSymbols(count: number): string[] {
  const pool = [...SYMBOL_BANK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
