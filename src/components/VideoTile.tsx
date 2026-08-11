import { useEffect, useRef } from "react";
import type { ParticipantTile } from "../types";

export function VideoTile({
  participant,
  compact = false,
}: {
  participant: ParticipantTile;
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const tracks: MediaStreamTrack[] = [];
    if (participant.videoTrack) tracks.push(participant.videoTrack);
    if (!participant.isLocal && participant.audioTrack) {
      tracks.push(participant.audioTrack);
    }
    if (tracks.length === 0) {
      el.srcObject = null;
      return;
    }
    el.srcObject = new MediaStream(tracks);
  }, [participant.videoTrack, participant.audioTrack, participant.isLocal]);

  const initial = participant.userName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={`video-tile ${compact ? "video-tile--compact" : ""}`}>
      {participant.videoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
        />
      ) : (
        <div className="video-tile__placeholder">
          <span>{initial}</span>
        </div>
      )}
      <span className="video-tile__label">
        {participant.userName}
        {participant.isLocal ? " (you)" : ""}
      </span>
    </div>
  );
}
