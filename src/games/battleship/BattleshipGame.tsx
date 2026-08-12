import { useEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import {
  BOARD_SIZE,
  SHIP_SIZES,
  canPlace,
  cellKey,
  countShipsAfloat,
  placeFleet,
  remainingSizes,
  shipCells,
  type Ship,
} from "./fleet";
import { ShipHull, shipName } from "./ShipHull";

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
  phase: "placing" | "playing" | "game-over";
  hostId: string;
  players: PublicPlayer[];
  readyIds: string[];
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

function ShotMarkers({ shots }: { shots: Shot[] }) {
  return (
    <>
      {shots.map((s) => (
        <div
          key={`${s.row}-${s.col}`}
          className="bs-marker"
          style={{
            left: `${(s.col / BOARD_SIZE) * 100}%`,
            top: `${(s.row / BOARD_SIZE) * 100}%`,
            width: `${100 / BOARD_SIZE}%`,
            height: `${100 / BOARD_SIZE}%`,
          }}
        >
          {s.hit ? "💥" : "🌊"}
        </div>
      ))}
    </>
  );
}

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
  const [placedShips, setPlacedShips] = useState<Ship[]>([]);
  const [orientation, setOrientation] = useState<"h" | "v">("h");
  const [placeError, setPlaceError] = useState(false);
  const fleetsRef = useRef<Record<string, Ship[]>>({});

  function sendFleet(playerId: string, ships: Ship[]) {
    if (playerId === localSessionId) setMyFleet(ships);
    else send("fleet", { ships }, playerId);
  }

  function applyPlaceFleet(current: PublicState, senderId: string, ships: Ship[]) {
    if (current.phase !== "placing") return;
    if (ships.length !== SHIP_SIZES.length) return;
    fleetsRef.current[senderId] = ships;
    if (current.readyIds.includes(senderId)) return;
    const readyIds = [...current.readyIds, senderId];

    if (readyIds.length >= current.players.length) {
      updateState({
        ...current,
        phase: "playing",
        readyIds,
        currentPlayerId: current.players[0].sessionId,
        shots: Object.fromEntries(current.players.map((p) => [p.sessionId, []])),
        shipsRemaining: Object.fromEntries(
          current.players.map((p) => [p.sessionId, fleetsRef.current[p.sessionId]?.length ?? SHIP_SIZES.length])
        ),
      });
      // Push everyone's own fleet back to them now — covers the case where
      // someone reopened this screen while waiting and lost their local copy.
      for (const p of current.players) {
        if (fleetsRef.current[p.sessionId]) sendFleet(p.sessionId, fleetsRef.current[p.sessionId]);
      }
    } else {
      updateState({ ...current, readyIds });
    }
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
        if (state.phase !== "placing" && fleetsRef.current[senderId]) {
          sendFleet(senderId, fleetsRef.current[senderId]);
        }
        return;
      }
      if (type === "place-fleet") {
        applyPlaceFleet(state, senderId, (payload as FleetPayload).ships);
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

    fleetsRef.current = {};
    setMyFleet([]);
    setPlacedShips([]);
    setOrientation("h");
    startAsHost({
      phase: "placing",
      hostId: localSessionId ?? "",
      players: order,
      readyIds: [],
      currentPlayerId: "",
      winnerId: null,
      shots: {},
      shipsRemaining: {},
    });
  }

  function handlePlacementTap(row: number, col: number) {
    const hitShip = placedShips.find((ship) => ship.some((c) => c.row === row && c.col === col));
    if (hitShip) {
      setPlacedShips((prev) => prev.filter((s) => s !== hitShip));
      setPlaceError(false);
      return;
    }
    const nextSize = remainingSizes(placedShips)[0];
    if (!nextSize) return;
    const cells = shipCells(row, col, nextSize, orientation === "h");
    if (!cells || !canPlace(placedShips, cells)) {
      setPlaceError(true);
      setTimeout(() => setPlaceError(false), 900);
      return;
    }
    setPlacedShips((prev) => [...prev, cells]);
    setPlaceError(false);
  }

  function handleRandomize() {
    setPlacedShips(placeFleet());
    setPlaceError(false);
  }

  function handleReady() {
    if (!state || placedShips.length < SHIP_SIZES.length) return;
    setMyFleet(placedShips);
    if (isHost) applyPlaceFleet(state, localSessionId ?? "", placedShips);
    else send("place-fleet", { ships: placedShips });
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
        <p>Place your fleet, then fire at hidden coordinates to sink the other person's ships first.</p>
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

  if (state.phase === "placing") {
    const amReady = state.readyIds.includes(localSessionId ?? "");
    const opponent = state.players.find((p) => p.sessionId !== localSessionId);

    if (amReady) {
      return (
        <div className="dg-lobby">
          <h2>⚓ Fleet placed!</h2>
          <p className="dg-hint">Waiting for {opponent?.name ?? "the other player"} to place their fleet…</p>
          <button className="link-button" onClick={onExit}>
            Back to games
          </button>
        </div>
      );
    }

    const nextSize = remainingSizes(placedShips)[0];
    const cells = Array.from({ length: BOARD_SIZE }, (_, row) =>
      Array.from({ length: BOARD_SIZE }, (_, col) => ({ row, col }))
    );

    return (
      <div className="battleship-game">
        <div className="dg-header">
          <button className="link-button dg-exit" onClick={onExit}>
            ← Games
          </button>
          <div className="bs-turn-banner">Place your fleet</div>
        </div>

        <p className="bs-place-hint">
          {nextSize
            ? placeError
              ? "Can't place it there — try another spot."
              : `Tap a square to place your ${shipName(nextSize)} (${nextSize} squares). Tap a placed ship to pick it up again.`
            : "All ships placed!"}
        </p>

        <div className="bs-boards">
          <div className="bs-board-block">
            <div className="bs-grid-stack">
              <div className="bs-grid">
                {cells.map((row) =>
                  row.map(({ row: r, col: c }) => (
                    <button
                      key={`${r}-${c}`}
                      className="bs-cell"
                      onClick={() => handlePlacementTap(r, c)}
                      aria-label={`Row ${r + 1}, column ${c + 1}`}
                    />
                  ))
                )}
              </div>
              <div className="bs-hulls">
                {placedShips.map((ship, i) => (
                  <ShipHull key={i} ship={ship} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bs-placement-controls">
          <button className="link-button" onClick={() => setOrientation((o) => (o === "h" ? "v" : "h"))}>
            {orientation === "h" ? "↔ Horizontal" : "↕ Vertical"} (tap to rotate)
          </button>
          <button className="link-button" onClick={handleRandomize}>
            🎲 Randomize
          </button>
        </div>

        <div className="dom-actions">
          <button
            className="primary-button"
            onClick={handleReady}
            disabled={placedShips.length < SHIP_SIZES.length}
          >
            Ready!
          </button>
        </div>
      </div>
    );
  }

  const myTurn = state.currentPlayerId === localSessionId;
  const opponent = state.players.find((p) => p.sessionId !== localSessionId);
  const myShots = state.shots[localSessionId ?? ""] ?? [];
  const theirShots = opponent ? state.shots[opponent.sessionId] ?? [] : [];

  const cells = Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => ({ row, col }))
  );

  function shotClass(shot: Shot | undefined) {
    if (!shot) return "bs-cell";
    return shot.hit ? "bs-cell bs-cell--hit" : "bs-cell bs-cell--miss";
  }

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
          <div className="bs-grid-stack">
            <div className="bs-grid">
              {cells.map((row) =>
                row.map(({ row: r, col: c }) => {
                  const shot = myShots.find((s) => s.row === r && s.col === c);
                  return (
                    <button
                      key={`${r}-${c}`}
                      className={shotClass(shot)}
                      disabled={!myTurn || !!shot}
                      onClick={() => handleFire(r, c)}
                      aria-label={`Fire at row ${r + 1}, column ${c + 1}`}
                    />
                  );
                })
              )}
            </div>
            <div className="bs-markers">
              <ShotMarkers shots={myShots} />
            </div>
          </div>
        </div>

        <div className="bs-board-block bs-board-block--mine">
          <div className="bs-board-label">My fleet</div>
          <div className="bs-grid-stack">
            <div className="bs-grid bs-grid--mine">
              {cells.map((row) =>
                row.map(({ row: r, col: c }) => {
                  const shot = theirShots.find((s) => s.row === r && s.col === c);
                  return <div key={`${r}-${c}`} className={shotClass(shot)} />;
                })
              )}
            </div>
            <div className="bs-hulls">
              {myFleet.map((ship, i) => (
                <ShipHull key={i} ship={ship} />
              ))}
            </div>
            <div className="bs-markers">
              <ShotMarkers shots={theirShots} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
