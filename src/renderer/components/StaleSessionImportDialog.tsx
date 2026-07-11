interface Props {
  sessionLabel: string
  dateKey: string
  latestLogLabel: string
  logCount: number
  busy: boolean
  onCancel: () => void
  onUseCurrentSession: () => void
  onUseDateSession: () => void
}

/** Guard against accidentally extending a specialised session on a later day. */
export default function StaleSessionImportDialog({
  sessionLabel,
  dateKey,
  latestLogLabel,
  logCount,
  busy,
  onCancel,
  onUseCurrentSession,
  onUseDateSession
}: Props): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="modal stale-session-import-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="stale-session-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="stale-session-import-title">Import into “{sessionLabel}”?</h2>
        <p>
          The newest log in this session is from <strong>{latestLogLabel}</strong>, an earlier
          calendar day.
        </p>
        <p>
          Do you want to import {logCount === 1 ? 'this log' : `these ${logCount} logs`} into
          today’s <strong>{dateKey}</strong> session in the Library root instead?
        </p>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="ghost" onClick={onUseCurrentSession} disabled={busy}>
            Keep “{sessionLabel}”
          </button>
          <button type="button" onClick={onUseDateSession} disabled={busy}>
            {busy ? 'Importing…' : `Use ${dateKey}`}
          </button>
        </div>
      </div>
    </div>
  )
}
