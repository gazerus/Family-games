import { shuffle } from "../shuffle";

export const SYMBOL_BANK = [
  "🐶", "🐱", "🐰", "🦊", "🐼", "🐸", "🦁", "🐵",
  "🐷", "🐨", "🐯", "🐮", "🐔", "🐧", "🦉", "🐙",
  "🦋", "🐝", "🐢", "🦄", "🐳", "🐬", "🌟", "🌈",
] as const;

export function pickSymbols(count: number): string[] {
  return shuffle([...SYMBOL_BANK]).slice(0, count);
}

export { shuffle };
