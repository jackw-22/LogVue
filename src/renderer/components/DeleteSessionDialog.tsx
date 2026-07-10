import { useState } from 'react'
import type { DeleteSessionSummary } from '@shared/types/session'

interface Props {
  summary: DeleteSessionSummary
  busy: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (dontAskAgain: boolean) => void
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

/** Destructive confirmation shown only for sessions that contain user data. */
export default function DeleteSessionDialog({
  summary,
  busy,
  error,
  onCancel,
  onConfirm
}: Props): JSX.Element {
  const [dontAskAgain, setDontAskAgain] = useState(false)

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="modal delete-session-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-session-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-session-title">Delete “{summary.displayName}”?</h2>
        <p>
          This permanently deletes the session and everything inside it, including{' '}
          <strong>{plural(summary.fileCount, 'file')}</strong>
          {summary.childFolderCount > 0 && (
            <>
              {' '}and <strong>{plural(summary.childFolderCount, 'child folder')}</strong>
            </>
          )}
          .
        </p>
        <p className="danger-copy">This action cannot be undone.</p>

        <label className="check-row">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            disabled={busy}
          />
          Don’t ask again for sessions containing files or child folders
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => onConfirm(dontAskAgain)}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete session'}
          </button>
        </div>
      </div>
    </div>
  )
}
