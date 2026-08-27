import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "../AppShell";
import { ExitDoorIcon } from "../components/ExitDoorIcon";
import { colorForPlayerIndex } from "../games/playerColors";
import { FakeCallProvider } from "./FakeCallProvider";
import { testId } from "./testBus";

/**
 * Test mode: several simulated players in one page, on one device.
 *
 * Every player is a complete, independent copy of the app with its own
 * identity, its own tab and game state, and its own connection to the test
 * bus. Tapping a chip switches which one you're looking at; the others stay
 * mounted and live in the background, exactly as if they were other people's
 * phones, so a game you started as one player is still running when you
 * switch back to it.
 *
 * The point is being able to play both sides of a two-player game — take a
 * turn, switch, see it arrive, take the other turn — without a second phone
 * and without roping anyone in to help test.
 */

interface TestUser {
  id: string;
  name: string;
}

function initialUsers(seedName?: string): TestUser[] {
  return [
    { id: testId(), name: seedName?.trim() || "Player 1" },
    { id: testId(), name: "Player 2" },
  ];
}

function TestUserPane({
  user,
  index,
  active,
  onActivity,
}: {
  user: TestUser;
  index: number;
  active: boolean;
  onActivity: () => void;
}) {
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  return (
    <div
      className={`test-pane ${active ? "test-pane--active" : ""}`}
      style={{ ["--player-color" as string]: colorForPlayerIndex(index) }}
      aria-hidden={!active}
    >
      <FakeCallProvider userId={user.id} name={user.name} onActivity={onActivity}>
        <AppShell activeGameId={activeGameId} onSelectGame={setActiveGameId} />
      </FakeCallProvider>
      {activeGameId && (
        <button
          className="settings-corner-button exit-game-corner-button"
          onClick={() => setActiveGameId(null)}
          aria-label="Exit game"
          title="Exit game"
        >
          <ExitDoorIcon size={18} />
        </button>
      )}
    </div>
  );
}

export function TestModeApp({
  seedName,
  onExit,
}: {
  seedName?: string;
  onExit: () => void;
}) {
  const [users, setUsers] = useState<TestUser[]>(() => initialUsers(seedName));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const nextNumber = useRef(3);
  const activeChipRef = useRef<HTMLButtonElement | null>(null);

  const active = users.find((u) => u.id === activeId) ?? users[0];

  // With enough players the chips scroll; keep the one you just picked (or
  // just added) on screen rather than half off the edge.
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active?.id]);

  const markActivity = useCallback(
    (id: string) => {
      // Only worth flagging for a player you're not currently looking at.
      setBusyIds((prev) => {
        if (prev.has(id) || id === (activeId ?? users[0]?.id)) return prev;
        return new Set(prev).add(id);
      });
    },
    [activeId, users]
  );

  function switchTo(id: string) {
    setActiveId(id);
    setBusyIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function addUser() {
    const user = { id: testId(), name: `Player ${nextNumber.current++}` };
    setUsers((prev) => [...prev, user]);
    switchTo(user.id);
  }

  function removeUser(id: string) {
    const remaining = users.filter((u) => u.id !== id);
    setUsers(remaining);
    if (id === active?.id) setActiveId(remaining[0]?.id ?? null);
  }

  return (
    <div className="test-root">
      <header className="test-bar">
        <div className="test-bar__row">
          <span className="test-bar__badge">🧪 Test mode</span>
          <span className="test-bar__hint">
            {users.length} simulated {users.length === 1 ? "player" : "players"}, no real
            call
          </span>
          <button className="test-bar__exit" onClick={onExit} title="Leave test mode">
            Exit
          </button>
        </div>
        <div className="test-bar__row test-bar__row--players">
          <div className="test-bar__chips">
          {users.map((user, i) => {
            const isActive = user.id === active?.id;
            return (
              <div
                key={user.id}
                className={`test-chip-group ${isActive ? "test-chip-group--active" : ""}`}
                style={{ ["--player-color" as string]: colorForPlayerIndex(i) }}
              >
                <button
                  ref={isActive ? activeChipRef : undefined}
                  className={`test-chip ${isActive ? "test-chip--active" : ""}`}
                  onClick={() => switchTo(user.id)}
                  aria-pressed={isActive}
                >
                  <span className="test-chip__dot" />
                  <span className="test-chip__name">{user.name}</span>
                  {busyIds.has(user.id) && (
                    <span className="test-chip__badge" title="Something happened here" />
                  )}
                </button>
                {isActive && users.length > 1 && (
                  <button
                    className="test-chip__remove"
                    title={`Remove ${user.name} — they leave the call`}
                    aria-label={`Remove ${user.name} — they leave the call`}
                    onClick={() => removeUser(user.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          </div>
          {/* Outside the scrolling row above, so it stays reachable however
              many players are in the list. */}
          <button className="test-chip test-chip--add" onClick={addUser}>
            + Add
          </button>
        </div>
      </header>

      <div className="test-panes">
        {users.map((user, i) => (
          <TestUserPane
            key={user.id}
            user={user}
            index={i}
            active={user.id === active?.id}
            onActivity={() => markActivity(user.id)}
          />
        ))}
      </div>
    </div>
  );
}
