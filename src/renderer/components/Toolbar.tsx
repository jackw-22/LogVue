import { useQueryClient } from '@tanstack/react-query'
import type { AppSettings } from '@shared/types/session'
import { useAdbStatus, usePickArchiveRoot } from '../api/hooks'
import { useAppStore } from '../stores/appStore'

interface Props {
  settings: AppSettings
  onNewTopLevel: () => void
}

export default function Toolbar({ settings, onNewTopLevel }: Props): JSX.Element {
  const pick = usePickArchiveRoot()
  const qc = useQueryClient()
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const { data: adb } = useAdbStatus()

  return (
    <header className="toolbar">
      <span className="brand">LogVue</span>

      <div className="root">
        <span className="root-label">Archive</span>
        <code className="root-path" title={settings.archiveRoot ?? ''}>
          {settings.archiveRoot ?? 'none'}
        </code>
        <button className="ghost sm" onClick={() => pick.mutate()}>
          Change…
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button
          className={`tab ${view === 'archive' ? 'active' : ''}`}
          role="tab"
          aria-selected={view === 'archive'}
          onClick={() => setView('archive')}
        >
          Archive
        </button>
        <button
          className={`tab ${view === 'device' ? 'active' : ''}`}
          role="tab"
          aria-selected={view === 'device'}
          onClick={() => setView('device')}
        >
          Control Hub
        </button>
      </div>

      <div className="spacer" />

      {view === 'archive' && (
        <>
          <button
            className="ghost sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['archive', 'tree'] })}
          >
            Rescan
          </button>
          <button className="sm" onClick={onNewTopLevel}>
            + New session
          </button>
        </>
      )}
      {view === 'device' && (
        <button className="ghost sm" onClick={() => qc.invalidateQueries({ queryKey: ['adb', 'hubLogs'] })}>
          Refresh logs
        </button>
      )}

      <AdbBadge
        connected={!!adb?.connected}
        label={adb?.adbMissing ? 'adb not found' : adb?.connected ? adb.device ?? 'Control Hub' : 'not connected'}
      />
    </header>
  )
}

function AdbBadge({ connected, label }: { connected: boolean; label: string }): JSX.Element {
  return (
    <span className={`status ${connected ? 'ok' : 'off'}`} title={`ADB: ${connected ? 'connected' : 'disconnected'}`}>
      <span className="dot" /> {label}
    </span>
  )
}
