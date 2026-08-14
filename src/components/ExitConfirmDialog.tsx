export function ExitConfirmDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="exit-confirm-overlay" role="presentation" onClick={onStay}>
      <div
        className="exit-confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label="Leave Family Games?"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Leave Family Games?</h2>
        <p>You'll leave the call and lose anything happening in your game.</p>
        <button className="primary-button" onClick={onStay}>
          Stay
        </button>
        <button className="link-button exit-confirm-leave" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
