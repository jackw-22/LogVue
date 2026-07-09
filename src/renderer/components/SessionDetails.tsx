import { useEffect, useRef, useState } from 'react'
import {
  SELECTABLE_SESSION_TYPES,
  SESSION_TYPE_LABELS,
  toSelectableSessionType
} from '@shared/constants/sessionTypes'
import { isMatchType } from '@shared/constants/matchTypes'
import type { SessionType } from '@shared/types/session'
import { formatBytes } from '@shared/format/bytes'
import {
  useNotes,
  useFolderFiles,
  usePromoteFolder,
  useSession,
  useSettings,
  useShowFile,
  useUpdateMeta,
  useWriteNotes
} from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { allianceClass, kindBadge } from '../lib/alliance'
import { formatTimestamp } from '../lib/time'
import MatchInfoEditor from './MatchInfoEditor'
import MatchList from './MatchList'
import FolderDetails from './FolderDetails'
import FtcScoutSyncPanel from './FtcScoutSyncPanel'
import SuggestedLogs from './SuggestedLogs'

/** Quiet period after the last keystroke before notes are written to disk. */
const AUTOSAVE_DELAY_MS = 700

interface Props {
  path: string
  onNewChild: () => void
}

export default function SessionDetails({ path, onNewChild }: Props): JSX.Element {
  const { data: session, isLoading } = useSession(path)
  const { data: settings } = useSettings()
  const { data: notes } = useNotes(path)
  const { data: folderFiles } = useFolderFiles(path)
  const update = useUpdateMeta(path)
  const promote = usePromoteFolder(path)
  const saveNotes = useWriteNotes()
  const showFile = useShowFile()
  const select = useAppStore((s) => s.select)
  const setView = useAppStore((s) => s.setView)
  const sourceName = settings?.hubDataSource === 'folder' ? 'Folder Import' : 'Control Hub'

  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [draftNotes, setDraftNotes] = useState('')

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

  if (isLoading || !session) return <div className="details-empty">Loading…</div>

  const m = session.metadata
  const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean)
  const importedByName = new Map(m.files.map((f) => [f.filename, f]))
  const files = folderFiles ?? []

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
      {parsedTags.length > 0 && (
        <div className="tag-chips">
          {parsedTags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}

      {isMatchType(m.session_type) && <MatchInfoEditor path={path} match={m.match} />}
      {isMatchType(m.session_type) && <SuggestedLogs sessionPath={path} match={m.match} />}

      {m.session_type === 'competition_event' && (
        <>
          <FtcScoutSyncPanel session={session} />
          <MatchList eventPath={path} onCreateChild={onNewChild} />
        </>
      )}

      <section>
        <h3>
          Files <span className="muted small">({files.length})</span>
        </h3>
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
                <li key={f.filename}>
                  <span className="kind-badge boxed">{kindBadge(f.kind)}</span>
                  <span className="file-name">{f.filename}</span>
                  <span className="mono small muted">{formatBytes(f.sizeBytes)}</span>
                  <span className="mono small muted">
                    {f.tracked ? formatTimestamp(imported?.imported_at) : 'Loose file'}
                  </span>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => showFile.mutate({ path, filename: f.filename })}
                  >
                    Show in folder
                  </button>
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
    </div>
  )
}
