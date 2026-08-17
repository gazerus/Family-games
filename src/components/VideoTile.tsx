import { useEffect, useRef, useState } from "react";
import type { ParticipantTile } from "../types";
import { useCall } from "../call/CallContext";
import { ConfirmDialog } from "./ConfirmDialog";

export function VideoTile({
  participant,
  compact = false,
}: {
  participant: ParticipantTile;
  compact?: boolean;
}) {
  const { removeParticipant } = useCall();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

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
      {/* For a stuck or duplicate remote tile (a stale connection Daily
          hasn't cleaned up yet) — lets you clear it from your own view
          without waiting for it to time out on its own. */}
      {!participant.isLocal && (
        <button
          className="video-tile__remove"
          onClick={() => setConfirmingRemove(true)}
          aria-label={`Remove ${participant.userName}`}
          title={`Remove ${participant.userName}`}
        >
          ✕
        </button>
      )}
      {confirmingRemove && (
        <ConfirmDialog
          title={`Remove ${participant.userName}?`}
          message="Use this if their video is frozen or showing twice. If they're really still here, they can just rejoin."
          confirmLabel="Remove"
          onConfirm={() => {
            removeParticipant(participant.sessionId);
            setConfirmingRemove(false);
          }}
          onCancel={() => setConfirmingRemove(false)}
        />
      )}
    </div>
  );
}
