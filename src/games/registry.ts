import type { GameDefinition } from "./types";
import { DrawGuessGame } from "./drawguess/DrawGuessGame";
import { MemoryMatchGame } from "./memory/MemoryMatchGame";
import { ConnectFourGame } from "./connectfour/ConnectFourGame";

/**
 * Add a new game by dropping its component here — no other wiring needed.
 * Each game gets its own `gameId` for its Daily app-message channel (see
 * useGameChannel) and drives its own state; the hub just lists and launches it.
 * Turn-based games typically build on useHostGameState (see useHostGameState.ts)
 * for the "whoever starts is the authority" sync pattern.
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
  {
    id: "memory-match",
    name: "Memory Match",
    icon: "🧠",
    description: "Flip cards to find matching pairs. Most pairs wins.",
    minPlayers: 2,
    component: MemoryMatchGame,
  },
  {
    id: "connect-four",
    name: "Connect Four",
    icon: "🔴",
    description: "Drop discs to line up four in a row before they do.",
    minPlayers: 2,
    component: ConnectFourGame,
  },
];
