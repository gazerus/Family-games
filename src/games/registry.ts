import type { GameDefinition } from "./types";
import { DrawGuessGame } from "./drawguess/DrawGuessGame";

/**
 * Add a new game by dropping its component here — no other wiring needed.
 * Each game gets its own `gameId` for its Daily app-message channel (see
 * useGameChannel) and drives its own state; the hub just lists and launches it.
 */
export const GAMES: GameDefinition[] = [
  {
    id: "draw-guess",
    name: "Draw & Guess",
    icon: "🎨",
    description: "Take turns drawing a secret word while everyone else guesses.",
    minPlayers: 2,
    component: DrawGuessGame,
  },
];
