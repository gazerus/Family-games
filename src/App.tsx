import { useState } from "react";
import { CallProvider } from "./call/CallContext";
import { SetupScreen } from "./setup/SetupScreen";
import { clearProfile, loadProfile, saveProfile } from "./setup/storage";
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

function App() {
  const [profile, setProfile] = useState<FamilyProfile | null>(() => loadProfile());

  if (!profile) {
    return (
      <SetupScreen
        initial={{ roomUrl: roomFromLink() ?? undefined }}
        onComplete={(p) => {
          saveProfile(p);
          setProfile(p);
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
        className="settings-corner-button"
        onClick={() => {
          clearProfile();
          setProfile(null);
        }}
        aria-label="Change name or room"
        title="Change name or room"
      >
        ⚙️
      </button>
    </div>
  );
}

export default App;
