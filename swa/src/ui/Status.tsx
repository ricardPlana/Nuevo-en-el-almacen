// Pantallas de carga y de error, a pantalla completa.

export function Loading({ text = 'Cargando almacén…' }: { text?: string }) {
  return (
    <div className="status">
      <div className="status-box">
        <div className="loader" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p>{text}</p>
      </div>
    </div>
  )
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="status">
      <div className="status-box">
        <div className="status-icon" aria-hidden>
          ?
        </div>
        <h2>{title}</h2>
        {detail && <p className="status-detail">{detail}</p>}
        {onRetry && (
          <button className="primary-button" onClick={onRetry}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  )
}
