export default function AlertMessage({ type = 'info', message, onClose }) {
  if (!message) return null

  return (
    <div className={`alert ${type}`} role="alert">
      <span>{message}</span>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Tutup">
          ×
        </button>
      )}
    </div>
  )
}
