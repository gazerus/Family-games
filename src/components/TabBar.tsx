export type TabId = "video" | "games";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "video", label: "Video", icon: "🎥" },
  { id: "games", label: "Games", icon: "🎮" },
];

export function TabBar({
  active,
  onChange,
  activeGame,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  activeGame?: { icon: string; name: string } | null;
}) {
  return (
    <>
      {activeGame && active !== "games" && (
        <button className="tab-bar__resume" onClick={() => onChange("games")}>
          <span className="tab-bar__resume-icon">{activeGame.icon}</span>
          {activeGame.name} in progress — tap to return
        </button>
      )}
      <nav className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-bar__button ${active === tab.id ? "tab-bar__button--active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <span className="tab-bar__icon">{tab.icon}</span>
            <span className="tab-bar__label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
