import { useState } from "react";
import { CallProvider } from "./call/CallContext";
import { SetupScreen } from "./setup/SetupScreen";
import { loadProfile, saveProfile } from "./setup/storage";
import { TabBar } from "./components/TabBar";
import type { TabId } from "./components/TabBar";
import { VideoTab } from "./tabs/VideoTab";
import { ChatTab } from "./tabs/ChatTab";
import { GamesTab } from "./tabs/GamesTab";
import type { FamilyProfile } from "./types";
import "./App.css";

function AppShell({ profile }: { profile: FamilyProfile }) {
  const [activeTab, setActiveTab] = useState<TabId>("video");

  return (
    <CallProvider roomUrl={profile.roomUrl} name={profile.name}>
      <div className="app-shell">
        <main className="app-main">
          {activeTab === "video" && <VideoTab />}
          {activeTab === "chat" && <ChatTab />}
          {activeTab === "games" && <GamesTab />}
        </main>
        <TabBar active={activeTab} onChange={setActiveTab} />
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
          // Drop ?room=... from the address bar now that it's saved on this device.
          window.history.replaceState({}, "", window.location.pathname);
        }}
      />
    );
  }

  return (
    <div className="app-root">
      <AppShell key={`${profile.roomUrl}:${profile.name}`} profile={profile} />
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
      {inviteCopied && <div className="invite-toast">Link copied!</div>}
    </div>
  );
}

export default App;
