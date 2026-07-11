import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types/session'
import {
  useClearHubLogFolder,
  usePickArchiveRoot,
  usePickHubLogFolder,
  useSetAdbAddress,
  useSetConfirmDeletePopulatedSessions,
  useSetHubDataSource
} from '../api/hooks'

interface Props {
  settings: AppSettings
  onClose: () => void
}

export default function SettingsDialog({ settings, onClose }: Props): JSX.Element {
  const [adbAddress, setAdbAddressDraft] = useState(settings.adbAddress)
  const pickLibrary = usePickArchiveRoot()
  const setAdbAddress = useSetAdbAddress()
  const setHubDataSource = useSetHubDataSource()
  const pickHubLogFolder = usePickHubLogFolder()
  const clearHubLogFolder = useClearHubLogFolder()
  const setDeleteConfirmation = useSetConfirmDeletePopulatedSessions()
  const busy =
    pickLibrary.isPending ||
    setHubDataSource.isPending ||
    pickHubLogFolder.isPending ||
    clearHubLogFolder.isPending ||
    setDeleteConfirmation.isPending ||
    setAdbAddress.isPending

  useEffect(() => setAdbAddressDraft(settings.adbAddress), [settings.adbAddress])

  function commitAdbAddress(): void {
    const trimmed = adbAddress.trim()
    if (trimmed && trimmed !== settings.adbAddress) setAdbAddress.mutate(trimmed)
  }

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

          <label className="field">
            Wireless ADB address
            <input
              value={adbAddress}
              onChange={(e) => setAdbAddressDraft(e.target.value)}
              onBlur={commitAdbAddress}
              placeholder="192.168.43.1:5555"
              disabled={busy}
            />
            <span className="muted small">Used by the Connect action in the status pill.</span>
          </label>

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
