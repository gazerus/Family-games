import { useState } from "react";
import { TabBar } from "./components/TabBar";
import type { TabId } from "./components/TabBar";
import { VideoTab } from "./tabs/VideoTab";
import { GamesTab } from "./tabs/GamesTab";
import { GAMES } from "./games/registry";

/**
 * Everything inside the call: the two tabs and the bar that switches them.
 * The caller supplies the call itself by wrapping this in a provider — the
 * real CallProvider normally, or test mode's stand-in (see src/test/).
 */
export function AppShell({
  activeGameId,
  onSelectGame,
}: {
  activeGameId: string | null;
  onSelectGame: (id: string | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("video");
  const activeGame = GAMES.find((g) => g.id === activeGameId) ?? null;

  return (
    <div className="app-shell">
      <main className="app-main">
        {/* Both panes stay mounted and are only hidden via CSS, not
            unmounted, so a game in progress (its network listeners,
            per-race local state, timers, ...) survives switching to the
            Video tab and back — kids do this constantly. */}
        <div className={`app-tab-pane ${activeTab === "video" ? "app-tab-pane--active" : ""}`}>
          <VideoTab />
        </div>
        <div className={`app-tab-pane ${activeTab === "games" ? "app-tab-pane--active" : ""}`}>
          <GamesTab activeGameId={activeGameId} onSelectGame={onSelectGame} />
        </div>
      </main>
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        activeGame={activeGame ? { icon: activeGame.icon, name: activeGame.name } : null}
      />
    </div>
  );
}
