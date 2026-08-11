import { useState } from "react";
import type { FormEvent } from "react";
import type { FamilyProfile } from "../types";

function isLikelyDailyUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname.endsWith("daily.co");
  } catch {
    return false;
  }
}

function roomNickname(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, "")) || "the family room";
  } catch {
    return "the family room";
  }
}

export function SetupScreen({
  initial,
  onComplete,
  onCancel,
}: {
  initial: Partial<FamilyProfile> | null;
  onComplete: (profile: FamilyProfile) => void;
  onCancel?: () => void;
}) {
  const linkedRoomUrl = initial?.roomUrl && isLikelyDailyUrl(initial.roomUrl) ? initial.roomUrl : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [roomUrl, setRoomUrl] = useState(initial?.roomUrl ?? "");
  const [editingRoom, setEditingRoom] = useState(!linkedRoomUrl);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = roomUrl.trim();
    if (!trimmedName) {
      setError("Enter a name so everyone knows who's who.");
      return;
    }
    if (!isLikelyDailyUrl(trimmedUrl)) {
      setError("That doesn't look like a room link. It should look like https://yourfamily.daily.co/roomname");
      return;
    }
    setError(null);
    onComplete({ name: trimmedName, roomUrl: trimmedUrl });
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>👋 Family Room</h1>
        <p className="setup-subtitle">Video chat + games, just for us.</p>

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Your name</span>
            <input
              autoFocus
              type="text"
              value={name}
              maxLength={20}
              placeholder="e.g. Mia"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {linkedRoomUrl && !editingRoom ? (
            <div className="room-confirm">
              <span>
                ✓ Joining <strong>{roomNickname(linkedRoomUrl)}</strong>
              </span>
              <button type="button" className="link-button" onClick={() => setEditingRoom(true)}>
                Not the right room?
              </button>
            </div>
          ) : (
            <label className="field">
              <span>Family room link</span>
              <input
                type="text"
                value={roomUrl}
                placeholder="https://yourfamily.daily.co/livingroom"
                onChange={(e) => setRoomUrl(e.target.value)}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>
          )}

          {error && <p className="setup-error">{error}</p>}

          <button type="submit" className="primary-button">
            {onCancel ? "Save" : "Join the family room"}
          </button>
          {onCancel && (
            <button type="button" className="link-button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </form>

        <button
          type="button"
          className="link-button"
          onClick={() => setShowHelp((v) => !v)}
        >
          {showHelp ? "Hide" : "Where do I get a room link?"}
        </button>

        {showHelp && (
          <div className="setup-help">
            <p>Whoever sets this up first needs a free Daily.co room:</p>
            <ol>
              <li>
                Go to <strong>dashboard.daily.co</strong> and make a free
                account.
              </li>
              <li>Click "Create room" — leave the defaults, it's fine.</li>
              <li>Copy the room URL it gives you.</li>
              <li>
                Paste that <em>same</em> link into this screen on every
                phone that should join (yours, the girls', mum's) — or
                better, send everyone a link like
                <br />
                <code>https://gazerus.github.io/Family-games/?room=&lt;your room URL&gt;</code>
                <br />
                so it's pre-filled and they only have to type their name.
              </li>
            </ol>
            <p>
              Everyone who opens the same link lands in the same family
              room. You only need to do this once per device — it's
              remembered after that.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
