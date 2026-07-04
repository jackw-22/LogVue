import { useQueryClient } from '@tanstack/react-query'
import type { AppSettings } from '@shared/types/session'
import { usePickArchiveRoot } from '../api/hooks'

interface Props {
  settings: AppSettings
  onNewTopLevel: () => void
}

export default function Toolbar({ settings, onNewTopLevel }: Props): JSX.Element {
  const pick = usePickArchiveRoot()
  const qc = useQueryClient()

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

      <div className="spacer" />

      <button className="ghost sm" onClick={() => qc.invalidateQueries({ queryKey: ['archive', 'tree'] })}>
        Rescan
      </button>
      <button className="sm" onClick={onNewTopLevel}>
        + New session
      </button>

      {/* Placeholders for later phases */}
      <span className="status na" title="ADB support arrives in Phase 2">
        ADB: n/a
      </span>
    </header>
  )
}
