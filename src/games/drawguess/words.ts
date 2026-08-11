export const WORD_BANK = [
  "dog", "cat", "fish", "bird", "rabbit", "horse", "elephant", "lion",
  "tiger", "monkey", "frog", "duck", "cow", "sheep", "bee", "butterfly",
  "spider", "snake", "shark", "whale",
  "apple", "banana", "pizza", "cake", "ice cream", "cookie", "egg",
  "watermelon", "carrot", "sandwich",
  "sun", "moon", "star", "cloud", "rainbow", "tree", "flower", "mountain",
  "beach", "snowman",
  "house", "car", "boat", "airplane", "bicycle", "train", "rocket",
  "umbrella", "balloon", "kite",
  "ball", "book", "chair", "table", "clock", "hat", "shoe", "glasses",
  "guitar", "camera",
  "robot", "dragon", "castle", "pirate", "ghost", "unicorn", "dinosaur",
  "wizard", "mermaid", "superhero",
] as const;

export function pickRandomWord(exclude: ReadonlySet<string> = new Set()): string {
  const pool = WORD_BANK.filter((w) => !exclude.has(w));
  const source = pool.length > 0 ? pool : WORD_BANK;
  return source[Math.floor(Math.random() * source.length)];
}
