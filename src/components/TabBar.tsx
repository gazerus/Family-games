export type TabId = "video" | "chat" | "games";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "video", label: "Video", icon: "🎥" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "games", label: "Games", icon: "🎮" },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
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
  );
}
