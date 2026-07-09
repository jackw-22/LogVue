import { formatLogCount } from '@shared/format/match'
import { formatBytes } from '@shared/format/bytes'
import { FILE_KIND_LABELS } from '@shared/constants/fileKinds'
import type { FileKind } from '@shared/types/session'
import { useArchiveTree, useFolderFiles } from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { findNode } from '../lib/tree'

interface Props {
  path: string
  name: string
  displayName: string
  /** True when this folder carries an explicit `container` marker (vs. a not-yet-recognised bare folder). */
  isExplicitContainer: boolean
  onRecognise: () => void
  onKeepAsFolder: () => void
  busy: boolean
}

/**
 * Lightweight view for a plain grouping folder (ARCHITECTURE §10.1): no session chrome,
 * just the recognise/keep choice. A bare folder with loose logs in it is nudged toward
 * becoming a session; an explicit container only offers "Recognise as session" to undo.
 */
export default function FolderDetails({
  path,
  name,
  displayName,
  isExplicitContainer,
  onRecognise,
  onKeepAsFolder,
  busy
}: Props): JSX.Element {
  const { data: tree } = useArchiveTree(true)
  const { data: files } = useFolderFiles(path)
  const select = useAppStore((s) => s.select)
  const node = tree ? findNode(tree, path) : null
  const looseLogs = !isExplicitContainer ? node?.logCount ?? 0 : 0
  const childCount = node?.children.length ?? 0

  return (
    <div className="details">
      <div className="details-head">
        <button className="back-link" onClick={() => select(null)}>
          ← All logs
        </button>
        <h2 className="folder-title">📁 {displayName}</h2>
        <code className="details-path">{name}</code>
      </div>

      <div className="callout neutral">
        {isExplicitContainer ? (
          <p>
            This is a folder, not a session. It groups{' '}
            {childCount === 1 ? '1 item' : `${childCount} items`} and is excluded from
            session filters and counts.
          </p>
        ) : looseLogs > 0 ? (
          <p>
            This folder isn’t a session yet and contains {formatLogCount(looseLogs)} — it
            looks like it should be one.
          </p>
        ) : (
          <p>This folder isn’t a session. Keep it as a plain grouping folder, or recognise it as a session.</p>
        )}
        <div className="callout-actions">
          <button className="sm" onClick={onRecognise} disabled={busy}>
            Recognise as session
          </button>
          {!isExplicitContainer && (
            <button className="ghost sm" onClick={onKeepAsFolder} disabled={busy}>
              Keep as folder
            </button>
          )}
        </div>
      </div>

      <section>
        <h3>
          Files <span className="muted small">({files?.length ?? 0})</span>
        </h3>
        {!files || files.length === 0 ? (
          <p className="muted small">No loose files in this folder.</p>
        ) : (
          <ul className="file-list">
            {files.map((f) => (
              <li key={f.filename}>
                <span className="file-name">{f.filename}</span>
                <span className="chip">{FILE_KIND_LABELS[f.kind as FileKind] ?? f.kind}</span>
                <span className="muted small">{formatBytes(f.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
