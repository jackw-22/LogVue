import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSettings } from './api/hooks'
import { useAppStore } from './stores/appStore'
import Toolbar from './components/Toolbar'
import QuickFindBar from './components/QuickFindBar'
import SessionTree from './components/SessionTree'
import SessionDetails from './components/SessionDetails'
import LogDashboard from './components/LogDashboard'
import HubLogTable from './components/HubLogTable'
import EmptyState from './components/EmptyState'
import NewSessionDialog from './components/NewSessionDialog'
import SettingsDialog from './components/SettingsDialog'

export default function App(): JSX.Element {
  const { data: settings, isLoading } = useSettings()
  const selectedPath = useAppStore((s) => s.selectedPath)
  const view = useAppStore((s) => s.view)
  const qc = useQueryClient()

  // When set, holds the parent folder we're creating a session under.
  const [newParent, setNewParent] = useState<{ path: string; label: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    return window.api.onArchiveChanged(() => {
      qc.invalidateQueries({ queryKey: ['archive', 'tree'] })
      qc.invalidateQueries({ queryKey: ['archive', 'session'] })
      qc.invalidateQueries({ queryKey: ['archive', 'files'] })
      qc.invalidateQueries({ queryKey: ['index'] })
      qc.invalidateQueries({ queryKey: ['adb', 'hubLogs'] })
    })
  }, [qc])

  if (isLoading) return <div className="boot">Starting LogVue…</div>
  if (!settings?.archiveRoot) return <EmptyState />

  return (
    <div className="shell">
      <Toolbar
        settings={settings}
        onNewTopLevel={() => setNewParent({ path: settings.archiveRoot as string, label: 'Library' })}
        onSettings={() => setShowSettings(true)}
      />

      {view === 'device' ? (
        <main className="pane detail-pane">
          <HubLogTable />
        </main>
      ) : (
        <>
          <QuickFindBar />
          <div className="panes">
            <aside className="pane tree-pane">
              <SessionTree />
            </aside>

            <main className="pane detail-pane">
              {selectedPath ? (
                <SessionDetails
                  path={selectedPath}
                  onNewChild={() => setNewParent({ path: selectedPath, label: 'this session' })}
                />
              ) : (
                <LogDashboard />
              )}
            </main>
          </div>
        </>
      )}

      {newParent && (
        <NewSessionDialog
          parentPath={newParent.path}
          parentLabel={newParent.label}
          onClose={() => setNewParent(null)}
        />
      )}
      {showSettings && <SettingsDialog settings={settings} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
