import { useCall } from "../call/CallContext";
import { VideoTile } from "./VideoTile";

/** Compact row of video tiles shown above the active tab content (e.g. while playing a game). */
export function VideoStrip() {
  const { participants, joinState } = useCall();
  if (joinState !== "joined" || participants.length === 0) return null;

  return (
    <div className="video-strip">
      {participants.map((p) => (
        <VideoTile key={p.sessionId} participant={p} compact />
      ))}
    </div>
  );
}
