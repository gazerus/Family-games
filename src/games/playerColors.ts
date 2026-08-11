export const PLAYER_COLORS = ["#f97316", "#3b82f6", "#22c55e", "#e11d48"] as const;

export function colorForPlayerIndex(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
