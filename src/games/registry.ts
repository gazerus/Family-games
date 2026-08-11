import type { GameDefinition } from "./types";
import { DrawGuessGame } from "./drawguess/DrawGuessGame";
import { MemoryMatchGame } from "./memory/MemoryMatchGame";
import { ConnectFourGame } from "./connectfour/ConnectFourGame";
import { SnakesLaddersGame } from "./snakesladders/SnakesLaddersGame";
import { DominoesGame } from "./dominoes/DominoesGame";
import { CritterCardsGame } from "./crittercards/CritterCardsGame";

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
  {
    id: "snakes-ladders",
    name: "Snakes & Ladders",
    icon: "🐍",
    description: "Roll the dice, race to square 100 — watch out for snakes!",
    minPlayers: 2,
    component: SnakesLaddersGame,
  },
  {
    id: "dominoes",
    name: "Dominoes",
    icon: "🁣",
    description: "Match the open ends of the chain. First to empty their hand wins.",
    minPlayers: 2,
    component: DominoesGame,
  },
  {
    id: "critter-cards",
    name: "Critter Cards",
    icon: "🐾",
    description: "Match by color or number. Skip, Reverse, and Draw 2 mix things up.",
    minPlayers: 2,
    component: CritterCardsGame,
  },
];
