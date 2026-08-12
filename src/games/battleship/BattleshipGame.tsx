import { useEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { BOARD_SIZE, cellKey, countShipsAfloat, placeFleet, type Ship } from "./fleet";

const GAME_ID = "battleship";

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface Shot {
  row: number;
  col: number;
  hit: boolean;
}

interface PublicState {
  phase: "playing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  currentPlayerId: string;
  winnerId: string | null;
  shots: Record<string, Shot[]>;
  shipsRemaining: Record<string, number>;
}

interface FleetPayload {
  ships: Ship[];
}

interface FirePayload {
  row: number;
  col: number;
}

type BattleshipPayload = PublicState | FleetPayload | FirePayload | Record<string, never>;

export function BattleshipGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, BattleshipPayload>(GAME_ID, "game-over");

  const [myFleet, setMyFleet] = useState<Ship[]>([]);
  const fleetsRef = useRef<Record<string, Ship[]>>({});

  function sendFleet(playerId: string, ships: Ship[]) {
    if (playerId === localSessionId) setMyFleet(ships);
    else send("fleet", { ships }, playerId);
  }

  function applyFire(current: PublicState, senderId: string, row: number, col: number) {
    if (current.phase !== "playing" || current.currentPlayerId !== senderId) return;
    const myShots = current.shots[senderId] ?? [];
    if (myShots.some((s) => s.row === row && s.col === col)) return;

    const opponent = current.players.find((p) => p.sessionId !== senderId);
    if (!opponent) return;
    const fleet = fleetsRef.current[opponent.sessionId] ?? [];
    const hit = fleet.some((ship) => ship.some((c) => c.row === row && c.col === col));

    const nextShots = { ...current.shots, [senderId]: [...myShots, { row, col, hit }] };
    const hitCells = new Set(
      nextShots[senderId].filter((s) => s.hit).map((s) => cellKey(s.row, s.col))
    );
    const remaining = countShipsAfloat(fleet, hitCells);
    const shipsRemaining = { ...current.shipsRemaining, [opponent.sessionId]: remaining };
    const won = remaining === 0;

    updateState({
      ...current,
      shots: nextShots,
      shipsRemaining,
      phase: won ? "game-over" : "playing",
      winnerId: won ? senderId : null,
      currentPlayerId: won ? senderId : opponent.sessionId,
    });
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type === "fleet") {
        setMyFleet((payload as FleetPayload).ships);
        return;
      }
      if (!isHost || !state) return;
      if (type === "request-state") {
        if (fleetsRef.current[senderId]) sendFleet(senderId, fleetsRef.current[senderId]);
        return;
      }
      if (type === "fire") {
        const { row, col } = payload as FirePayload;
        applyFire(state, senderId, row, col);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost, state]);

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;

    const fleets: Record<string, Ship[]> = {};
    for (const p of order) fleets[p.sessionId] = placeFleet();
    fleetsRef.current = fleets;

    startAsHost({
      phase: "playing",
      hostId: localSessionId ?? "",
      players: order,
      currentPlayerId: order[0].sessionId,
      winnerId: null,
      shots: Object.fromEntries(order.map((p) => [p.sessionId, []])),
      shipsRemaining: Object.fromEntries(order.map((p) => [p.sessionId, fleets[p.sessionId].length])),
    });
    for (const p of order) sendFleet(p.sessionId, fleets[p.sessionId]);
  }

  function handleFire(row: number, col: number) {
    if (!state) return;
    if (isHost) applyFire(state, localSessionId ?? "", row, col);
    else send("fire", { row, col });
  }

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>🚢 Battleship</h2>
        <p>Fire at hidden coordinates to sink the other person's fleet first.</p>
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
    return (
      <div className="dg-lobby">
        <h2>🏆 {winner?.name ?? "Someone"} wins!</h2>
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
  const opponent = state.players.find((p) => p.sessionId !== localSessionId);
  const myShots = state.shots[localSessionId ?? ""] ?? [];
  const theirShots = opponent ? state.shots[opponent.sessionId] ?? [] : [];
  const myShipCells = new Set(myFleet.flatMap((ship) => ship.map((c) => cellKey(c.row, c.col))));

  const cells = Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => ({ row, col }))
  );

  return (
    <div className="battleship-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="bs-turn-banner">{myTurn ? "Your turn — fire away" : `${opponent?.name}'s turn`}</div>
      </div>

      <div className="bs-scoreboard">
        <span className="dom-opponent-chip">You: {state.shipsRemaining[localSessionId ?? ""] ?? 0} ships left</span>
        {opponent && (
          <span className="dom-opponent-chip">
            {opponent.name}: {state.shipsRemaining[opponent.sessionId] ?? 0} ships left
          </span>
        )}
      </div>

      <div className="bs-boards">
        <div className="bs-board-block">
          <div className="bs-board-label">Enemy waters</div>
          <div className="bs-grid">
            {cells.map((row) =>
              row.map(({ row: r, col: c }) => {
                const shot = myShots.find((s) => s.row === r && s.col === c);
                const className = shot
                  ? shot.hit
                    ? "bs-cell bs-cell--hit"
                    : "bs-cell bs-cell--miss"
                  : "bs-cell";
                return (
                  <button
                    key={`${r}-${c}`}
                    className={className}
                    disabled={!myTurn || !!shot}
                    onClick={() => handleFire(r, c)}
                    aria-label={`Fire at row ${r + 1}, column ${c + 1}`}
                  >
                    {shot ? (shot.hit ? "💥" : "🌊") : ""}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="bs-board-block bs-board-block--mine">
          <div className="bs-board-label">My fleet</div>
          <div className="bs-grid bs-grid--mine">
            {cells.map((row) =>
              row.map(({ row: r, col: c }) => {
                const key = cellKey(r, c);
                const hasShip = myShipCells.has(key);
                const shot = theirShots.find((s) => s.row === r && s.col === c);
                const classes = ["bs-cell", "bs-cell--mine"];
                if (hasShip) classes.push("bs-cell--ship");
                if (shot?.hit) classes.push("bs-cell--hit");
                else if (shot) classes.push("bs-cell--miss");
                return (
                  <div key={key} className={classes.join(" ")}>
                    {shot ? (shot.hit ? "💥" : "🌊") : ""}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
