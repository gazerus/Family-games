import { useState } from "react";
import { CallProvider } from "./call/CallProvider";
import { AppShell } from "./AppShell";
import { SetupScreen } from "./setup/SetupScreen";
import { loadProfile, saveProfile } from "./setup/storage";
import { ExitDoorIcon } from "./components/ExitDoorIcon";
import { GAMES } from "./games/registry";
import { TestModeApp } from "./test/TestModeApp";
import { useBackGuard } from "./useBackGuard";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { FamilyProfile } from "./types";
import "./App.css";

function roomFromLink(): string | null {
  return new URLSearchParams(window.location.search).get("room");
}

/** `?test=1` opens test mode straight away — see src/test/TestModeApp.tsx. */
function testModeFromLink(): boolean {
  return new URLSearchParams(window.location.search).has("test");
}

function inviteLinkFor(roomUrl: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}?room=${encodeURIComponent(roomUrl)}`;
}

function App() {
  const [profile, setProfile] = useState<FamilyProfile | null>(() => loadProfile());
  const [editing, setEditing] = useState(false);
  const [testMode, setTestMode] = useState(testModeFromLink);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const activeGame = GAMES.find((g) => g.id === activeGameId) ?? null;
  const { showExitConfirm, confirmExit, cancelExit } = useBackGuard({
    enabled: !!profile && !testMode,
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

  if (testMode) {
    return (
      <TestModeApp
        seedName={profile?.name}
        onExit={() => {
          setTestMode(false);
          window.history.replaceState({}, "", window.location.pathname);
        }}
      />
    );
  }

  if (!profile || editing) {
    return (
      <SetupScreen
        initial={profile ?? { roomUrl: roomFromLink() ?? undefined }}
        onCancel={profile ? () => setEditing(false) : undefined}
        onTestMode={() => setTestMode(true)}
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
      <CallProvider
        key={`${profile.roomUrl}:${profile.name}`}
        roomUrl={profile.roomUrl}
        name={profile.name}
      >
        <AppShell activeGameId={activeGameId} onSelectGame={setActiveGameId} />
      </CallProvider>
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
