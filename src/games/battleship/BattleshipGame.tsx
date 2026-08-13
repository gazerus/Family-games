import { useEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import {
  BOARD_SIZE,
  SHIP_SIZES,
  cellKey,
  clampEditable,
  countShipsAfloat,
  editableCells,
  overlappingCells,
  placeFleet,
  rotateEditable,
  shipsToEditable,
  type EditableShip,
  type Ship,
} from "./fleet";
import { ShipHull, shipName } from "./ShipHull";

const GAME_ID = "battleship";
const WIN_FREEZE_MS = 3400;

interface PublicPlayer {
  sessionId: string;
  name: string;
}

interface Shot {
  row: number;
  col: number;
  hit: boolean;
}

interface SunkEvent {
  id: string;
  shooterId: string;
  ownerId: string;
  size: number;
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
  lastSunk: SunkEvent | null;
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
  const [placedShips, setPlacedShips] = useState<EditableShip[]>([]);
  const [sunkToast, setSunkToast] = useState<string | null>(null);
  const [revealWinner, setRevealWinner] = useState(false);
  const fleetsRef = useRef<Record<string, Ship[]>>({});
  const processedSunkId = useRef<string | null>(null);
  const placementBoardRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    id: number;
    startRow: number;
    startCol: number;
    startClientX: number;
    startClientY: number;
    cellSize: number;
    moved: boolean;
  } | null>(null);

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
        lastSunk: null,
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
    const prevHitCells = new Set(myShots.filter((s) => s.hit).map((s) => cellKey(s.row, s.col)));
    const hitCells = new Set(
      nextShots[senderId].filter((s) => s.hit).map((s) => cellKey(s.row, s.col))
    );
    const remaining = countShipsAfloat(fleet, hitCells);
    const shipsRemaining = { ...current.shipsRemaining, [opponent.sessionId]: remaining };
    const won = remaining === 0;

    const justSunk = fleet.find(
      (ship) =>
        !ship.every((c) => prevHitCells.has(cellKey(c.row, c.col))) &&
        ship.every((c) => hitCells.has(cellKey(c.row, c.col)))
    );

    updateState({
      ...current,
      shots: nextShots,
      shipsRemaining,
      phase: won ? "game-over" : "playing",
      winnerId: won ? senderId : null,
      currentPlayerId: won ? senderId : opponent.sessionId,
      lastSunk: justSunk
        ? { id: `${Date.now()}-${row}-${col}`, shooterId: senderId, ownerId: opponent.sessionId, size: justSunk.length }
        : current.lastSunk,
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

  useEffect(() => {
    const evt = state?.lastSunk;
    if (!evt || processedSunkId.current === evt.id) return;
    processedSunkId.current = evt.id;
    const isMe = evt.shooterId === localSessionId;
    const ownerName = state?.players.find((p) => p.sessionId === evt.ownerId)?.name ?? "their";
    const shooterName = state?.players.find((p) => p.sessionId === evt.shooterId)?.name ?? "Someone";
    setSunkToast(
      isMe ? `You sank ${ownerName}'s ${shipName(evt.size)}!` : `${shooterName} sank your ${shipName(evt.size)}!`
    );
    const t = setTimeout(() => setSunkToast(null), 3200);
    return () => clearTimeout(t);
  }, [state?.lastSunk, state?.players, localSessionId]);

  // Keep the final boards (including the last "sunk" toast) visible for a
  // beat before swapping to the trophy screen.
  useEffect(() => {
    if (state?.phase !== "game-over") {
      setRevealWinner(false);
      return;
    }
    const t = setTimeout(() => setRevealWinner(true), WIN_FREEZE_MS);
    return () => clearTimeout(t);
  }, [state?.phase, state?.winnerId]);

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;

    fleetsRef.current = {};
    setMyFleet([]);
    setPlacedShips(shipsToEditable(placeFleet()));
    setSunkToast(null);
    processedSunkId.current = null;
    startAsHost({
      phase: "placing",
      hostId: localSessionId ?? "",
      players: order,
      readyIds: [],
      currentPlayerId: "",
      winnerId: null,
      shots: {},
      shipsRemaining: {},
      lastSunk: null,
    });
  }

  // Drag to move a ship (constrained to the grid, free to overlap other
  // ships while dragging); tap without moving to rotate it in place.
  function handleShipPointerDown(e: React.PointerEvent<HTMLDivElement>, es: EditableShip) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const boardRect = placementBoardRef.current?.getBoundingClientRect();
    if (!boardRect) return;
    dragStateRef.current = {
      id: es.id,
      startRow: es.row,
      startCol: es.col,
      startClientX: e.clientX,
      startClientY: e.clientY,
      cellSize: boardRect.width / BOARD_SIZE,
      moved: false,
    };
  }

  function handleShipPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    const deltaCols = Math.round(dx / drag.cellSize);
    const deltaRows = Math.round(dy / drag.cellSize);
    setPlacedShips((prev) =>
      prev.map((s) =>
        s.id === drag.id
          ? clampEditable({ ...s, row: drag.startRow + deltaRows, col: drag.startCol + deltaCols })
          : s
      )
    );
  }

  function handleShipPointerUp(_e: React.PointerEvent<HTMLDivElement>, es: EditableShip) {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      setPlacedShips((prev) => prev.map((s) => (s.id === es.id ? rotateEditable(s) : s)));
    }
  }

  function handleRandomize() {
    setPlacedShips(shipsToEditable(placeFleet()));
  }

  function handleReady() {
    if (!state || placedShips.length < SHIP_SIZES.length) return;
    if (overlappingCells(placedShips).size > 0) return;
    const ships = placedShips.map(editableCells);
    setMyFleet(ships);
    if (isHost) applyPlaceFleet(state, localSessionId ?? "", ships);
    else send("place-fleet", { ships });
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

  if (state.phase === "game-over" && revealWinner) {
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

    const cells = Array.from({ length: BOARD_SIZE }, (_, row) =>
      Array.from({ length: BOARD_SIZE }, (_, col) => ({ row, col }))
    );
    const overlaps = overlappingCells(placedShips);

    return (
      <div className="battleship-game">
        <div className="dg-header">
          <button className="link-button dg-exit" onClick={onExit}>
            ← Games
          </button>
          <div className="bs-turn-banner">Place your fleet</div>
        </div>

        <p className="bs-place-hint">
          {overlaps.size > 0
            ? "Ships are overlapping — drag them apart before you're ready."
            : "Drag a ship to move it, tap a ship to rotate it."}
        </p>

        <div className="bs-boards">
          <div className="bs-board-block">
            <div className="bs-grid-stack" ref={placementBoardRef}>
              <div className="bs-grid">
                {cells.map((row) =>
                  row.map(({ row: r, col: c }) => <div key={`${r}-${c}`} className="bs-cell" />)
                )}
              </div>
              <div className="bs-overlaps">
                {[...overlaps].map((key) => {
                  const [r, c] = key.split(",").map(Number);
                  return (
                    <div
                      key={key}
                      className="bs-overlap-cell"
                      style={{
                        left: `${(c / BOARD_SIZE) * 100}%`,
                        top: `${(r / BOARD_SIZE) * 100}%`,
                        width: `${(1 / BOARD_SIZE) * 100}%`,
                        height: `${(1 / BOARD_SIZE) * 100}%`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="bs-hulls">
                {placedShips.map((ship) => (
                  <ShipHull
                    key={ship.id}
                    ship={editableCells(ship)}
                    draggable
                    onPointerDown={(e) => handleShipPointerDown(e, ship)}
                    onPointerMove={handleShipPointerMove}
                    onPointerUp={(e) => handleShipPointerUp(e, ship)}
                    onPointerCancel={(e) => handleShipPointerUp(e, ship)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bs-placement-controls">
          <button className="link-button" onClick={handleRandomize}>
            🎲 Randomize
          </button>
        </div>

        <div className="dom-actions">
          <button
            className="primary-button"
            onClick={handleReady}
            disabled={placedShips.length < SHIP_SIZES.length || overlaps.size > 0}
          >
            Ready!
          </button>
        </div>
      </div>
    );
  }

  const isFrozenWin = state.phase === "game-over";
  const myTurn = !isFrozenWin && state.currentPlayerId === localSessionId;
  const opponent = state.players.find((p) => p.sessionId !== localSessionId);
  const myShots = state.shots[localSessionId ?? ""] ?? [];
  const theirShots = opponent ? state.shots[opponent.sessionId] ?? [] : [];
  const frozenWinner = isFrozenWin ? state.players.find((p) => p.sessionId === state.winnerId) : null;

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
        <div className="bs-turn-banner">
          {isFrozenWin
            ? `🏆 ${frozenWinner?.name ?? "Someone"} wins!`
            : myTurn
              ? "Your turn — fire away"
              : `${opponent?.name}'s turn`}
        </div>
      </div>

      {sunkToast && <div className="bs-sunk-toast">💥 {sunkToast}</div>}

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
