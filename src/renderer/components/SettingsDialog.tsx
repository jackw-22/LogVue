import type { AppSettings } from '@shared/types/session'
import {
  useClearHubLogFolder,
  usePickArchiveRoot,
  usePickHubLogFolder,
  useSetConfirmDeletePopulatedSessions,
  useSetHubDataSource
} from '../api/hooks'

interface Props {
  settings: AppSettings
  onClose: () => void
}

export default function SettingsDialog({ settings, onClose }: Props): JSX.Element {
  const pickLibrary = usePickArchiveRoot()
  const setHubDataSource = useSetHubDataSource()
  const pickHubLogFolder = usePickHubLogFolder()
  const clearHubLogFolder = useClearHubLogFolder()
  const setDeleteConfirmation = useSetConfirmDeletePopulatedSessions()
  const busy =
    pickLibrary.isPending ||
    setHubDataSource.isPending ||
    pickHubLogFolder.isPending ||
    clearHubLogFolder.isPending ||
    setDeleteConfirmation.isPending

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal settings-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => e.preventDefault()}
      >
        <h2>Settings</h2>

        <section className="settings-section">
          <div>
            <h3>Library</h3>
            <code className="settings-path" title={settings.archiveRoot ?? ''}>
              {settings.archiveRoot ?? 'No folder selected'}
            </code>
          </div>
          <button type="button" className="ghost sm" onClick={() => pickLibrary.mutate()} disabled={busy}>
            Change…
          </button>
        </section>

        <section className="settings-section vertical">
          <h3>Hub Log Source</h3>
          <div className="seg" role="tablist">
            <button
              type="button"
              className={`seg-btn ${settings.hubDataSource === 'adb' ? 'active' : ''}`}
              onClick={() => setHubDataSource.mutate('adb')}
              disabled={busy}
            >
              Control Hub
            </button>
            <button
              type="button"
              className={`seg-btn ${settings.hubDataSource === 'folder' ? 'active' : ''}`}
              onClick={() => setHubDataSource.mutate('folder')}
              disabled={busy}
            >
              Folder Import
            </button>
          </div>

          {settings.hubDataSource === 'folder' && (
            <div className="folder-source-row">
              <code className="settings-path" title={settings.hubLogFolder ?? ''}>
                {settings.hubLogFolder ?? 'No folder selected'}
              </code>
              <button
                type="button"
                className="ghost sm"
                onClick={() => pickHubLogFolder.mutate()}
                disabled={busy}
              >
                Choose…
              </button>
              {settings.hubLogFolder && (
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => clearHubLogFolder.mutate()}
                  disabled={busy}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </section>

        <section className="settings-section vertical">
          <h3>Deletion</h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.confirmDeletePopulatedSessions}
              onChange={(e) => setDeleteConfirmation.mutate(e.target.checked)}
              disabled={busy}
            />
            Confirm before deleting sessions containing files or child folders
          </label>
          <span className="muted small">
            Empty sessions are deleted immediately. You can restore confirmations here after choosing
            “Don’t ask again”.
          </span>
        </section>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </form>
    </div>
  )
}
