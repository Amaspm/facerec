export default function LoadingSpinner({ label = 'Memuat...' }) {
  return (
    <div className="loading-spinner" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
