import { useEffect, useRef, useState } from 'react'
import {
  SELECTABLE_SESSION_TYPES,
  SESSION_TYPE_LABELS,
  toSelectableSessionType
} from '@shared/constants/sessionTypes'
import { isMatchType } from '@shared/constants/matchTypes'
import type { DeleteSessionSummary, SessionType } from '@shared/types/session'
import { formatBytes } from '@shared/format/bytes'
import {
  useNotes,
  useDeleteSession,
  useDeleteSessionSummary,
  useFolderFiles,
  useOpenFile,
  usePromoteFolder,
  useSession,
  useSettings,
  useSetConfirmDeletePopulatedSessions,
  useShowFile,
  useShowFolder,
  useUpdateMeta,
  useWriteNotes
} from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { allianceClass, kindBadge } from '../lib/alliance'
import { formatTimestamp } from '../lib/time'
import FileMetaChips from './FileMetaChips'
import MatchInfoEditor from './MatchInfoEditor'
import MatchList from './MatchList'
import FolderDetails from './FolderDetails'
import FtcScoutSyncPanel from './FtcScoutSyncPanel'
import SuggestedLogs from './SuggestedLogs'
import DeleteSessionDialog from './DeleteSessionDialog'

/** Quiet period after the last keystroke before notes are written to disk. */
const AUTOSAVE_DELAY_MS = 700

interface Props {
  path: string
  onNewChild: () => void
}

interface FileMenuState {
  filename: string
  x: number
  y: number
}

function filePath(dir: string, filename: string): string {
  const separator = dir.includes('\\') ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${separator}${filename}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not delete the session.'
}

export default function SessionDetails({ path, onNewChild }: Props): JSX.Element {
  const { data: session, isLoading } = useSession(path)
  const { data: settings } = useSettings()
  const { data: notes } = useNotes(path)
  const { data: folderFiles } = useFolderFiles(path)
  const update = useUpdateMeta(path)
  const promote = usePromoteFolder(path)
  const saveNotes = useWriteNotes()
  const inspectDelete = useDeleteSessionSummary()
  const deleteSession = useDeleteSession()
  const setDeleteConfirmation = useSetConfirmDeletePopulatedSessions()
  const openFile = useOpenFile()
  const showFile = useShowFile()
  const showFolder = useShowFolder()
  const select = useAppStore((s) => s.select)
  const setView = useAppStore((s) => s.setView)
  const showFileMeta = useAppStore((s) => s.showFileMeta)
  const setShowFileMeta = useAppStore((s) => s.setShowFileMeta)
  const sourceName = settings?.hubDataSource === 'folder' ? 'Folder Import' : 'Control Hub'

  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [fileMenu, setFileMenu] = useState<FileMenuState | null>(null)
  const [deletePrompt, setDeletePrompt] = useState<DeleteSessionSummary | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Reset local edit state whenever the loaded session changes.
  useEffect(() => {
    if (session) {
      setName(session.metadata.display_name)
      setTags(session.metadata.tags.join(', '))
    }
  }, [session?.path, session?.metadata.display_name, session?.metadata.tags])

  // Notes autosave. `dirty` is the source of truth for "there are edits to flush":
  // comparing against the cached notes would race the mutation's cache update.
  const [dirty, setDirty] = useState(false)
  const draftRef = useRef(draftNotes)
  draftRef.current = draftNotes
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const saveMut = saveNotes.mutate

  // Adopt the loaded notes once per session, so a save's cache update never
  // clobbers characters typed while the write was in flight.
  const loadedPath = useRef<string | null>(null)
  useEffect(() => {
    if (notes === undefined || loadedPath.current === path) return
    loadedPath.current = path
    setDraftNotes(notes)
    setDirty(false)
  }, [path, notes])

  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => {
      setDirty(false)
      saveMut({ path, md: draftRef.current })
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [dirty, draftNotes, path, saveMut])

  // Flush pending edits when the session changes or the panel unmounts, writing
  // to the path captured here rather than whichever session is now selected.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) saveMut({ path, md: draftRef.current })
    }
  }, [path, saveMut])

  useEffect(() => {
    if (!fileMenu) return
    const close = () => setFileMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [fileMenu])

  if (isLoading || !session) return <div className="details-empty">Loading…</div>

  const m = session.metadata
  const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean)
  const importedByName = new Map(m.files.map((f) => [f.filename, f]))
  const files = folderFiles ?? []
  const deleteBusy =
    inspectDelete.isPending || deleteSession.isPending || setDeleteConfirmation.isPending

  async function deleteNow(): Promise<void> {
    setDeleteError(null)
    try {
      await deleteSession.mutateAsync(path)
      setDeletePrompt(null)
      select(null)
    } catch (error) {
      setDeleteError(errorMessage(error))
    }
  }

  async function requestDelete(): Promise<void> {
    setDeleteError(null)
    try {
      // Resolve any pending autosave before inspecting the folder, so notes are
      // included in the destructive confirmation and cannot race the deletion.
      if (dirtyRef.current) {
        dirtyRef.current = false
        setDirty(false)
        await saveNotes.mutateAsync({ path, md: draftRef.current })
      }

      const summary = await inspectDelete.mutateAsync(path)
      const populated = summary.fileCount > 0 || summary.childFolderCount > 0
      if (populated && settings?.confirmDeletePopulatedSessions !== false) {
        setDeletePrompt(summary)
      } else {
        await deleteNow()
      }
    } catch (error) {
      setDeleteError(errorMessage(error))
    }
  }

  async function confirmDelete(dontAskAgain: boolean): Promise<void> {
    setDeleteError(null)
    try {
      if (dontAskAgain) await setDeleteConfirmation.mutateAsync(false)
      await deleteNow()
    } catch (error) {
      setDeleteError(errorMessage(error))
    }
  }

  // The mutation is shared across sessions, so only report its result for this one.
  const lastSaveWasThisSession = saveNotes.variables?.path === path
  const notesStatus =
    saveNotes.isError && lastSaveWasThisSession
      ? 'Could not save notes'
      : dirty || (saveNotes.isPending && lastSaveWasThisSession)
        ? 'Saving…'
        : saveNotes.isSuccess && lastSaveWasThisSession
          ? 'Saved'
          : ''

  // A bare folder gets a lightweight view until it is recognised as a general session.
  if (!session.hasSessionJson) {
    return (
      <FolderDetails
        path={path}
        name={session.name}
        displayName={m.display_name}
        onRecognise={() => promote.mutate()}
        busy={promote.isPending || update.isPending}
      />
    )
  }

  const colour = allianceClass(m.match?.alliance ?? null)

  return (
    <div className="details">
      <div className="details-head">
        <button className="back-link" onClick={() => select(null)}>
          ← All logs
        </button>
        <div className="details-title">
          <span className={`dot lg ${colour}`} />
          <input
            className="title-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== m.display_name && update.mutate({ display_name: name.trim() })}
          />
          <select
            className="type-chip"
            value={toSelectableSessionType(m.session_type)}
            onChange={(e) => update.mutate({ session_type: e.target.value as SessionType })}
            title="Session type"
          >
            {SELECTABLE_SESSION_TYPES.map((t) => (
              <option key={t} value={t}>
                {SESSION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <code className="details-path">{session.name}</code>
      </div>

      <label className="field">
        Tags (comma-separated)
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onBlur={() => update.mutate({ tags: parsedTags })}
          placeholder="swerve, localization"
        />
      </label>
      <div className="session-actions-row">
        <div className="tag-chips">
          {parsedTags.length === 0 ? (
            <span className="chip placeholder">No tags added</span>
          ) : (
            parsedTags.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))
          )}
        </div>
        <button type="button" onClick={() => showFolder.mutate(path)}>
          Show folder
        </button>
      </div>

      {isMatchType(m.session_type) && <MatchInfoEditor path={path} match={m.match} />}
      {isMatchType(m.session_type) && <SuggestedLogs sessionPath={path} match={m.match} />}

      {m.session_type === 'competition_event' && (
        <>
          <FtcScoutSyncPanel session={session} />
          <MatchList eventPath={path} onCreateChild={onNewChild} />
        </>
      )}

      <section>
        <div className="files-head">
          <h3>
            Files <span className="muted small">({files.length})</span>
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
        {files.length === 0 ? (
          <div className="empty-files">
            <span>No files in this session folder yet.</span>
            <button className="sm" onClick={() => setView('device')}>
              Go to {sourceName} →
            </button>
          </div>
        ) : (
          <ul className="file-list">
            {files.map((f) => {
              const imported = importedByName.get(f.filename)
              return (
                <li
                  key={f.filename}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setFileMenu({
                      filename: f.filename,
                      x: Math.min(e.clientX, window.innerWidth - 220),
                      y: e.clientY
                    })
                  }}
                >
                  <span className="kind-badge boxed">{kindBadge(f.kind)}</span>
                  <span className="file-name">{f.filename}</span>
                  <span className="mono small muted">{formatBytes(f.sizeBytes)}</span>
                  <span className="mono small muted">
                    {f.tracked ? formatTimestamp(imported?.recorded_at ?? imported?.imported_at) : 'Loose file'}
                  </span>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => openFile.mutate({ path, filename: f.filename })}
                  >
                    Open
                  </button>
                  {showFileMeta && f.metadata && <FileMetaChips metadata={f.metadata} />}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="notes-head">
          <h3>Notes</h3>
          <span className={`small notes-status ${saveNotes.isError ? 'error' : 'muted'}`} role="status">
            {notesStatus}
          </span>
        </div>
        <textarea
          className="notes"
          value={draftNotes}
          onChange={(e) => {
            setDraftNotes(e.target.value)
            setDirty(true)
          }}
          placeholder="Add notes about this session…"
        />
      </section>

      {m.session_type !== 'competition_event' && (
        <section>
          <button className="ghost sm" onClick={onNewChild}>
            + New child session
          </button>
        </section>
      )}

      <section className="danger-zone">
        <div>
          <h3>Delete session</h3>
          <p>Permanently remove this session, its files, notes, and child sessions.</p>
        </div>
        <button
          type="button"
          className="danger"
          onClick={() => void requestDelete()}
          disabled={deleteBusy}
        >
          {inspectDelete.isPending ? 'Checking…' : deleteSession.isPending ? 'Deleting…' : 'Delete session'}
        </button>
        {deleteError && !deletePrompt && <p className="form-error">{deleteError}</p>}
      </section>

      {fileMenu && (
        <div
          className="context-menu"
          style={{ left: fileMenu.x, top: fileMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              showFile.mutate({ path, filename: fileMenu.filename })
              setFileMenu(null)
            }}
          >
            Show in folder
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(fileMenu.filename)
              setFileMenu(null)
            }}
          >
            Copy filename
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(filePath(path, fileMenu.filename))
              setFileMenu(null)
            }}
          >
            Copy path
          </button>
        </div>
      )}

      {deletePrompt && (
        <DeleteSessionDialog
          summary={deletePrompt}
          busy={deleteSession.isPending || setDeleteConfirmation.isPending}
          error={deleteError}
          onCancel={() => {
            setDeletePrompt(null)
            setDeleteError(null)
          }}
          onConfirm={(dontAskAgain) => void confirmDelete(dontAskAgain)}
        />
      )}
    </div>
  )
}
