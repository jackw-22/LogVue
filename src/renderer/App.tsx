import { useState } from 'react'
import { useSettings } from './api/hooks'
import { useAppStore } from './stores/appStore'
import Toolbar from './components/Toolbar'
import SessionTree from './components/SessionTree'
import SessionDetails from './components/SessionDetails'
import HubLogTable from './components/HubLogTable'
import EmptyState from './components/EmptyState'
import NewSessionDialog from './components/NewSessionDialog'

export default function App(): JSX.Element {
  const { data: settings, isLoading } = useSettings()
  const selectedPath = useAppStore((s) => s.selectedPath)
  const view = useAppStore((s) => s.view)

  // When set, holds the parent folder we're creating a session under.
  const [newParent, setNewParent] = useState<{ path: string; label: string } | null>(null)

  if (isLoading) return <div className="boot">Starting LogVue…</div>
  if (!settings?.archiveRoot) return <EmptyState />

  return (
    <div className="shell">
      <Toolbar
        settings={settings}
        onNewTopLevel={() => setNewParent({ path: settings.archiveRoot as string, label: 'archive root' })}
      />

      {view === 'device' ? (
        <main className="pane detail-pane">
          <HubLogTable />
        </main>
      ) : (
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
              <div className="details-empty">Select a session on the left, or create a new one.</div>
            )}
          </main>
        </div>
      )}

      {newParent && (
        <NewSessionDialog
          parentPath={newParent.path}
          parentLabel={newParent.label}
          onClose={() => setNewParent(null)}
        />
      )}
    </div>
  )
}
