import { useState } from "react";
import { GAMES } from "../games/registry";
import { VideoStrip } from "../components/VideoStrip";
import { useCall } from "../call/CallContext";

export function GamesTab() {
  const { participants } = useCall();
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const activeGame = GAMES.find((g) => g.id === activeGameId) ?? null;

  if (activeGame) {
    const GameComponent = activeGame.component;
    return (
      <div className="games-tab games-tab--active">
        <VideoStrip />
        <GameComponent onExit={() => setActiveGameId(null)} />
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
            onClick={() => setActiveGameId(game.id)}
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
    </div>
  );
}
