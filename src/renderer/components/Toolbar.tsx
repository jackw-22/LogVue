import { useQueryClient } from '@tanstack/react-query'
import type { AppSettings } from '@shared/types/session'
import { useAdbStatus, useConnectAdb, usePickArchiveRoot, useRebuildIndex } from '../api/hooks'
import { useAppStore } from '../stores/appStore'

interface Props {
  settings: AppSettings
  onNewTopLevel: () => void
  onSettings: () => void
}

export default function Toolbar({ settings, onNewTopLevel, onSettings }: Props): JSX.Element {
  const pick = usePickArchiveRoot()
  const rebuild = useRebuildIndex()
  const qc = useQueryClient()
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const { data: adb } = useAdbStatus()
  const connect = useConnectAdb()
  const sourceIsFolder = settings.hubDataSource === 'folder'
  const sourceName = sourceIsFolder ? 'Folder Import' : 'Control Hub'
  const sourceConnected = sourceIsFolder ? !!settings.hubLogFolder : !!adb?.connected
  const sourceLabel = sourceIsFolder
    ? settings.hubLogFolder
      ? 'folder source'
      : 'folder not set'
    : adb?.adbMissing
      ? 'adb not found'
      : adb?.connected
        ? adb.device ?? 'Control Hub'
        : 'not connected'

  return (
    <header className="toolbar">
      <span className="brand">LogVue</span>

      <div className="root">
        <span className="root-label">Library</span>
        <code className="root-path" title={settings.archiveRoot ?? ''}>
          {settings.archiveRoot ?? 'none'}
        </code>
        <button className="ghost sm" onClick={() => pick.mutate()}>
          Change…
        </button>
      </div>

      <div className="source-switch">
        <div className="tabs" role="tablist">
          <button
            className={`tab ${view === 'archive' ? 'active' : ''}`}
            role="tab"
            aria-selected={view === 'archive'}
            onClick={() => setView('archive')}
          >
            Library
          </button>
          <button
            className={`tab ${view === 'device' ? 'active' : ''}`}
            role="tab"
            aria-selected={view === 'device'}
            onClick={() => setView('device')}
          >
            {sourceName}
          </button>
        </div>
        <SourceBadge
          connected={sourceConnected}
          label={sourceLabel}
          sourceName={sourceName}
          address={settings.adbAddress}
          connecting={connect.isPending}
          onConnect={!sourceIsFolder && !adb?.adbMissing ? () => connect.mutate() : undefined}
        />
      </div>

      <div className="spacer" />

      <button className="ghost sm" onClick={onSettings}>
        Settings
      </button>

      {view === 'archive' && (
        <>
          <button
            className="ghost sm"
            onClick={() => rebuild.mutate()}
            disabled={rebuild.isPending}
          >
            {rebuild.isPending ? 'Rescanning…' : 'Rescan'}
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

    </header>
  )
}

function SourceBadge({
  connected,
  label,
  sourceName,
  address,
  connecting,
  onConnect
}: {
  connected: boolean
  label: string
  sourceName: string
  address: string
  connecting: boolean
  onConnect?: () => void
}): JSX.Element {
  const connectable = !!onConnect && !connected
  const displayLabel = connecting ? 'Connecting ADB…' : connectable ? 'Connect ADB' : label
  return (
    <button
      type="button"
      className={`source-status ${connected ? 'ok' : 'off'}${connectable ? ' connectable' : ''}${connecting ? ' connecting' : ''}`}
      title={
        connectable
          ? `Connect ADB to ${address}`
          : `${sourceName}: ${connected ? 'connected' : 'disconnected'}`
      }
      onClick={connectable ? onConnect : undefined}
      disabled={!connectable || connecting}
    >
      <span className="dot" />
      <span>{displayLabel}</span>
    </button>
  )
}
