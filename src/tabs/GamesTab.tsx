import { useEffect, useRef, useState } from "react";
import { GAMES } from "../games/registry";
import { VideoStrip } from "../components/VideoStrip";
import { useCall } from "../call/CallContext";

export function GamesTab({
  activeGameId,
  onSelectGame,
}: {
  activeGameId: string | null;
  onSelectGame: (id: string | null) => void;
}) {
  const { participants } = useCall();
  const activeGame = GAMES.find((g) => g.id === activeGameId) ?? null;

  const [leftNotice, setLeftNotice] = useState<string | null>(null);
  const prevNamesRef = useRef<Set<string>>(new Set());

  // Games have no backend and no server to notice a dropped connection —
  // Daily's own "participant-left" event (surfaced here via `participants`
  // shrinking) is the only signal available. If it happens while a game is
  // open, whoever's left would otherwise be stuck mid-game with no idea the
  // other person is gone, so kick back to the games list and say why.
  useEffect(() => {
    const currentNames = new Set(participants.map((p) => p.userName));
    if (activeGame) {
      const missing = [...prevNamesRef.current].filter((name) => !currentNames.has(name));
      if (missing.length > 0) {
        setLeftNotice(`${missing.join(" and ")} left the call — game ended.`);
        onSelectGame(null);
      }
    }
    prevNamesRef.current = currentNames;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants]);

  useEffect(() => {
    if (!leftNotice) return;
    const t = setTimeout(() => setLeftNotice(null), 5000);
    return () => clearTimeout(t);
  }, [leftNotice]);

  const leftToast = leftNotice && (
    <div className="left-call-toast" onClick={() => setLeftNotice(null)}>
      {leftNotice}
    </div>
  );

  if (activeGame) {
    const GameComponent = activeGame.component;
    return (
      <div className="games-tab games-tab--active">
        <VideoStrip />
        <GameComponent onExit={() => onSelectGame(null)} />
        {leftToast}
      </div>
    );
  }

  return (
    <div className="games-tab">
      <VideoStrip />
      <div className="game-grid">
        {GAMES.map((game) => (
          <button
            key={game.id}
            className="game-card"
            onClick={() => onSelectGame(game.id)}
          >
            <span className="game-card__icon">{game.icon}</span>
            <span className="game-card__name">{game.name}</span>
            <span className="game-card__description">{game.description}</span>
            {participants.length < game.minPlayers && (
              <span className="game-card__hint">
                Needs {game.minPlayers}+ people
              </span>
            )}
          </button>
        ))}
      </div>
      {leftToast}
    </div>
  );
}
