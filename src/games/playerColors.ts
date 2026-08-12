export const PLAYER_COLORS = ["#f97316", "#3b82f6", "#22c55e", "#e11d48"] as const;

export function colorForPlayerIndex(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

// Pale two-tone backgrounds matching each player's accent color, for
// marking "this player claimed this" without the full-strength color.
const PLAYER_PALE_GRADIENTS = [
  "linear-gradient(145deg, #ffedd5, #fed7aa)", // pale orange
  "linear-gradient(145deg, #dbeafe, #bfdbfe)", // pale blue
  "linear-gradient(145deg, #dcfce7, #bbf7d0)", // pale green
  "linear-gradient(145deg, #fee2e2, #fecaca)", // pale red
] as const;

export function paleGradientForPlayerIndex(index: number): string {
  return PLAYER_PALE_GRADIENTS[index % PLAYER_PALE_GRADIENTS.length];
}
