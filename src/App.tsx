import { useState } from "react";
import { CallProvider } from "./call/CallContext";
import { SetupScreen } from "./setup/SetupScreen";
import { loadProfile, saveProfile } from "./setup/storage";
import { TabBar } from "./components/TabBar";
import type { TabId } from "./components/TabBar";
import { ExitDoorIcon } from "./components/ExitDoorIcon";
import { VideoTab } from "./tabs/VideoTab";
import { GamesTab } from "./tabs/GamesTab";
import { GAMES } from "./games/registry";
import { useBackGuard } from "./useBackGuard";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { FamilyProfile } from "./types";
import "./App.css";

function AppShell({
  profile,
  activeGameId,
  onSelectGame,
}: {
  profile: FamilyProfile;
  activeGameId: string | null;
  onSelectGame: (id: string | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("video");
  const activeGame = GAMES.find((g) => g.id === activeGameId) ?? null;

  return (
    <CallProvider roomUrl={profile.roomUrl} name={profile.name}>
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
    </CallProvider>
  );
}

function roomFromLink(): string | null {
  return new URLSearchParams(window.location.search).get("room");
}

function inviteLinkFor(roomUrl: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}?room=${encodeURIComponent(roomUrl)}`;
}

function App() {
  const [profile, setProfile] = useState<FamilyProfile | null>(() => loadProfile());
  const [editing, setEditing] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const activeGame = GAMES.find((g) => g.id === activeGameId) ?? null;
  const { showExitConfirm, confirmExit, cancelExit } = useBackGuard({
    enabled: !!profile,
    activeGameId,
    setActiveGameId,
    editing,
    setEditing,
  });

  async function handleInvite() {
    if (!profile) return;
    const link = inviteLinkFor(profile.roomUrl);
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Family Room",
          text: "Join our family room — tap this link, then just type your name:",
          url: link,
        });
      } catch {
        // Share sheet dismissed — nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      window.prompt("Copy this link to send it:", link);
    }
  }

  if (!profile || editing) {
    return (
      <SetupScreen
        initial={profile ?? { roomUrl: roomFromLink() ?? undefined }}
        onCancel={profile ? () => setEditing(false) : undefined}
        onComplete={(p) => {
          saveProfile(p);
          setProfile(p);
          setEditing(false);
          setActiveGameId(null);
          // Drop ?room=... from the address bar now that it's saved on this device.
          window.history.replaceState({}, "", window.location.pathname);
        }}
      />
    );
  }

  return (
    <div className="app-root">
      <AppShell
        key={`${profile.roomUrl}:${profile.name}`}
        profile={profile}
        activeGameId={activeGameId}
        onSelectGame={setActiveGameId}
      />
      <button
        className="settings-corner-button invite-corner-button"
        onClick={handleInvite}
        aria-label="Share invite link"
        title="Share invite link"
      >
        🔗
      </button>
      <button
        className="settings-corner-button"
        onClick={() => setEditing(true)}
        aria-label="Change name or room"
        title="Change name or room"
      >
        ⚙️
      </button>
      {activeGame && (
        <button
          className="settings-corner-button exit-game-corner-button"
          onClick={() => setActiveGameId(null)}
          aria-label={`Exit ${activeGame.name}`}
          title={`Exit ${activeGame.name}`}
        >
          <ExitDoorIcon size={18} />
        </button>
      )}
      {inviteCopied && <div className="invite-toast">Link copied!</div>}
      {showExitConfirm && (
        <ConfirmDialog
          title="Leave Family Games?"
          message="You'll leave the call and lose anything happening in your game."
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={confirmExit}
          onCancel={cancelExit}
        />
      )}
    </div>
  );
}

export default App;
