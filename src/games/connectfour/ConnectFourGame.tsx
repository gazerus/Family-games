import { useEffect, useMemo } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";

const GAME_ID = "connect-four";
const ROWS = 6;
const COLS = 7;
const DIRECTIONS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

type Cell = string | null;

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface PublicState {
  phase: "playing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  board: Cell[][];
  currentPlayerId: string;
  winnerId: string | null;
  winningCells: [number, number][] | null;
}

interface DropPayload {
  col: number;
}

type ConnectFourPayload = PublicState | DropPayload;

const DISC_CLASS = ["c4-disc--red", "c4-disc--yellow"] as const;
const DISC_EMOJI = ["🔴", "🟡"] as const;

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

function findWin(board: Cell[][], row: number, col: number, playerId: string): [number, number][] | null {
  for (const [dr, dc] of DIRECTIONS) {
    const cells: [number, number][] = [[row, col]];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === playerId) {
        cells.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

export function ConnectFourGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, ConnectFourPayload>(GAME_ID, "game-over");

  function applyDrop(current: PublicState, col: number) {
    if (current.phase !== "playing") return;
    let landingRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!current.board[r][col]) {
        landingRow = r;
        break;
      }
    }
    if (landingRow === -1) return;

    const board = current.board.map((row) => [...row]);
    board[landingRow][col] = current.currentPlayerId;
    const winningCells = findWin(board, landingRow, col, current.currentPlayerId);
    const isFull = board.every((row) => row.every((cell) => cell !== null));
    const next = current.players.find((p) => p.sessionId !== current.currentPlayerId)!;

    updateState({
      ...current,
      board,
      phase: winningCells || isFull ? "game-over" : "playing",
      winnerId: winningCells ? current.currentPlayerId : null,
      winningCells,
      currentPlayerId: winningCells || isFull ? current.currentPlayerId : next.sessionId,
    });
  }

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    startAsHost({
      phase: "playing",
      hostId: localSessionId ?? "",
      players: order,
      board: emptyBoard(),
      currentPlayerId: order[0].sessionId,
      winnerId: null,
      winningCells: null,
    });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type !== "drop" || !isHost || !state || state.phase !== "playing") return;
      if (state.currentPlayerId !== senderId) return;
      applyDrop(state, (payload as DropPayload).col);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function handleColumnClick(col: number) {
    if (!state || state.phase !== "playing") return;
    if (state.currentPlayerId !== localSessionId) return;
    if (state.board[0][col]) return; // column full
    if (isHost) {
      applyDrop(state, col);
    } else {
      send("drop", { col });
    }
  }

  const playerIndex = useMemo(() => {
    if (!state) return new Map<string, number>();
    return new Map(state.players.map((p, i) => [p.sessionId, i]));
  }, [state]);

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🔴 Connect Four</h2>
        <p>Drop discs to line up four in a row before they do.</p>
        {presentPlayers.length < 2 ? (
          <p className="dg-hint">Need at least 2 people to have this game open.</p>
        ) : (
          <p className="dg-hint">
            {presentPlayers.length} people ready. Whoever starts runs the first game.
          </p>
        )}
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Start game
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (state.phase === "game-over") {
    const winner = state.players.find((p) => p.sessionId === state.winnerId);
    const winnerIdx = winner ? playerIndex.get(winner.sessionId)! : -1;
    return (
      <div className="dg-lobby">
        <h2>
          {winner ? `${DISC_EMOJI[winnerIdx]} ${winner.name} wins!` : "🤝 It's a draw!"}
        </h2>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const myTurn = state.currentPlayerId === localSessionId;
  const currentIdx = playerIndex.get(state.currentPlayerId) ?? 0;
  const currentPlayer = state.players[currentIdx];
  const winningSet = new Set((state.winningCells ?? []).map(([r, c]) => `${r}-${c}`));

  return (
    <div className="connect-four-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="c4-turn-banner">
          {DISC_EMOJI[currentIdx]} {myTurn ? "Your turn" : `${currentPlayer.name}'s turn`}
        </div>
      </div>

      <div className="c4-board-wrap">
        <div className="c4-board">
          <div className="c4-columns">
            {Array.from({ length: COLS }, (_, col) => (
              <button
                key={col}
                className="c4-column"
                onClick={() => handleColumnClick(col)}
                disabled={!myTurn || !!state.board[0][col]}
                aria-label={`Drop in column ${col + 1}`}
              >
                {Array.from({ length: ROWS }, (_, row) => {
                  const occupant = state.board[row][col];
                  const idx = occupant ? playerIndex.get(occupant) ?? 0 : -1;
                  const isWinningCell = winningSet.has(`${row}-${col}`);
                  return (
                    <div className="c4-cell" key={row}>
                      {occupant && (
                        <span
                          className={`c4-disc ${DISC_CLASS[idx]} ${isWinningCell ? "c4-disc--win" : ""}`}
                        />
                      )}
                    </div>
                  );
                })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dg-mini-scoreboard">
        {state.players.map((p, i) => (
          <span key={p.sessionId} className="dg-mini-score">
            {DISC_EMOJI[i]} {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
