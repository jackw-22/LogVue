import { formatLogCount } from '@shared/format/match'
import { formatBytes } from '@shared/format/bytes'
import { FILE_KIND_LABELS } from '@shared/constants/fileKinds'
import type { FileKind } from '@shared/types/session'
import { useArchiveTree, useFolderFiles } from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { findNode } from '../lib/tree'
import FileMetaChips from './FileMetaChips'

interface Props {
  path: string
  name: string
  displayName: string
  /** The folder has a session.json, but it couldn't be read (corrupt/foreign). */
  metadataInvalid?: boolean
  onRecognise: () => void
  busy: boolean
}

/**
 * Lightweight view for a bare folder before it is recognised as a general session.
 * A bare folder with loose logs in it is nudged toward becoming a session.
 */
export default function FolderDetails({
  path,
  name,
  displayName,
  metadataInvalid,
  onRecognise,
  busy
}: Props): JSX.Element {
  const { data: tree } = useArchiveTree(true)
  const { data: files } = useFolderFiles(path)
  const select = useAppStore((s) => s.select)
  const showFileMeta = useAppStore((s) => s.showFileMeta)
  const setShowFileMeta = useAppStore((s) => s.setShowFileMeta)
  const node = tree ? findNode(tree, path) : null
  const looseLogs = node?.logCount ?? 0
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

      {metadataInvalid && (
        <div className="callout">
          <p>
            This folder has a <code>session.json</code> that couldn’t be read — it may be
            corrupt or half-edited. Fix it by hand to restore the session, or recognise the
            folder below: the unreadable file is kept as <code>session.json.bak</code>.
          </p>
        </div>
      )}

      <div className="callout neutral">
        {looseLogs > 0 ? (
          <p>
            This folder isn’t a session yet and contains {formatLogCount(looseLogs)} — it
            looks like it should be one.
          </p>
        ) : (
          <p>
            This folder isn’t a session yet. Recognise it as a general session to include
            {childCount > 0 ? ` its ${childCount === 1 ? 'child' : 'children'} ` : ' it '}
            in the library.
          </p>
        )}
        <div className="callout-actions">
          <button className="sm" onClick={onRecognise} disabled={busy}>
            Recognise as session
          </button>
        </div>
      </div>

      <section>
        <div className="files-head">
          <h3>
            Files <span className="muted small">({files?.length ?? 0})</span>
          </h3>
          <label className="small muted meta-toggle">
            <input
              type="checkbox"
              checked={showFileMeta}
              onChange={(e) => setShowFileMeta(e.target.checked)}
            />
            Show metadata
          </label>
        </div>
        {!files || files.length === 0 ? (
          <p className="muted small">No loose files in this folder.</p>
        ) : (
          <ul className="file-list">
            {files.map((f) => (
              <li key={f.filename}>
                <span className="file-name">{f.filename}</span>
                <span className="chip">{FILE_KIND_LABELS[f.kind as FileKind] ?? f.kind}</span>
                <span className="muted small">{formatBytes(f.sizeBytes)}</span>
                {showFileMeta && f.metadata && <FileMetaChips metadata={f.metadata} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
