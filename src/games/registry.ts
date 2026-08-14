import type { GameDefinition } from "./types";
import { DrawGuessGame } from "./drawguess/DrawGuessGame";
import { MemoryMatchGame } from "./memory/MemoryMatchGame";
import { ConnectFourGame } from "./connectfour/ConnectFourGame";
import { SnakesLaddersGame } from "./snakesladders/SnakesLaddersGame";
import { CritterCardsGame } from "./crittercards/CritterCardsGame";
import { BattleshipGame } from "./battleship/BattleshipGame";
import { MazeRaceGame } from "./mazerace/MazeRaceGame";
import { FishingGame } from "./fishing/FishingGame";
import { FaceDoodleGame } from "./facedoodle/FaceDoodleGame";

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
    id: "critter-cards",
    name: "Critter Cards",
    icon: "🐾",
    description: "Match by color or number. Skip, Reverse, and Draw 2 mix things up.",
    minPlayers: 2,
    component: CritterCardsGame,
  },
  {
    id: "battleship",
    name: "Battleship",
    icon: "🚢",
    description: "Fire at hidden coordinates to sink the other person's fleet first.",
    minPlayers: 2,
    component: BattleshipGame,
  },
  {
    id: "maze-race",
    name: "Maze Race",
    icon: "🧩",
    description: "Race through your own maze to the exit — grab power-ups along the way.",
    minPlayers: 2,
    component: MazeRaceGame,
  },
  {
    id: "fishing-compete",
    name: "Fishing Compete",
    icon: "🎣",
    description: "Catch fish in your own pond — most points wins.",
    minPlayers: 2,
    component: FishingGame,
  },
  {
    id: "face-doodle",
    name: "Face Doodle",
    icon: "📸",
    description: "Snap their photo, decorate it with stickers and doodles, then send it back.",
    minPlayers: 2,
    component: FaceDoodleGame,
  },
];
