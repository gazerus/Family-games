export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="exit-confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className="exit-confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        <p>{message}</p>
        <button className="primary-button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button className="link-button exit-confirm-leave" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
