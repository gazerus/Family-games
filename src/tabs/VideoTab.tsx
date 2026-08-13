import { useCall } from "../call/CallContext";
import { ExitDoorIcon } from "../components/ExitDoorIcon";
import { VideoTile } from "../components/VideoTile";

export function VideoTab() {
  const {
    joinState,
    errorMessage,
    participants,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    leave,
    rejoin,
  } = useCall();

  if (joinState === "connecting") {
    return (
      <div className="tab-centered">
        <p>Connecting to the family room…</p>
      </div>
    );
  }

  if (joinState === "error") {
    return (
      <div className="tab-centered">
        <p className="setup-error">
          {errorMessage ?? "Couldn't connect to the family room."}
        </p>
        <button className="primary-button" onClick={rejoin}>
          Try again
        </button>
      </div>
    );
  }

  if (joinState === "left") {
    return (
      <div className="tab-centered">
        <p>You left the family room.</p>
        <button className="primary-button" onClick={rejoin}>
          Rejoin
        </button>
      </div>
    );
  }

  return (
    <div className="video-tab">
      <div className="video-grid">
        {participants.map((p) => (
          <VideoTile key={p.sessionId} participant={p} />
        ))}
      </div>

      <div className="call-controls">
        <button
          className={`control-button ${micOn ? "" : "control-button--off"}`}
          onClick={toggleMic}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? "🎤" : "🔇"}
        </button>
        <button
          className={`control-button ${cameraOn ? "" : "control-button--off"}`}
          onClick={toggleCamera}
          aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
        >
          {cameraOn ? "📷" : "🚫"}
        </button>
        <button
          className="control-button control-button--leave"
          onClick={leave}
          aria-label="Leave the family room"
        >
          <ExitDoorIcon />
        </button>
      </div>
    </div>
  );
}
