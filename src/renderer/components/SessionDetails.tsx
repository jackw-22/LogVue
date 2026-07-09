import { useEffect, useState } from 'react'
import {
  CONTAINER_TYPE,
  SELECTABLE_SESSION_TYPES,
  SESSION_TYPE_LABELS
} from '@shared/constants/sessionTypes'
import { isMatchType } from '@shared/constants/matchTypes'
import type { SessionType } from '@shared/types/session'
import { formatBytes } from '@shared/format/bytes'
import { useNotes, usePromoteFolder, useSession, useUpdateMeta, useWriteNotes } from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { allianceClass, kindBadge } from '../lib/alliance'
import { formatTimestamp } from '../lib/time'
import MatchInfoEditor from './MatchInfoEditor'
import MatchList from './MatchList'
import FolderDetails from './FolderDetails'

interface Props {
  path: string
  onNewChild: () => void
}

export default function SessionDetails({ path, onNewChild }: Props): JSX.Element {
  const { data: session, isLoading } = useSession(path)
  const { data: notes } = useNotes(path)
  const update = useUpdateMeta(path)
  const promote = usePromoteFolder(path)
  const saveNotes = useWriteNotes(path)
  const select = useAppStore((s) => s.select)
  const setView = useAppStore((s) => s.setView)

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

  useEffect(() => setDraftNotes(notes ?? ''), [path, notes])

  if (isLoading || !session) return <div className="details-empty">Loading…</div>

  const m = session.metadata
  const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean)

  // A plain folder (never recognised, or explicitly kept as one) gets a lightweight view
  // with the recognise/keep actions instead of full session chrome (ARCHITECTURE §10.1).
  if (!session.hasSessionJson || m.session_type === CONTAINER_TYPE) {
    return (
      <FolderDetails
        path={path}
        name={session.name}
        displayName={m.display_name}
        isExplicitContainer={session.hasSessionJson && m.session_type === CONTAINER_TYPE}
        onRecognise={() =>
          session.hasSessionJson
            ? update.mutate({ session_type: 'general_session' })
            : promote.mutate()
        }
        onKeepAsFolder={() => update.mutate({ session_type: CONTAINER_TYPE })}
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
            value={m.session_type}
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

      {m.session_type === 'competition_event' && (
        <MatchList eventPath={path} onCreateChild={onNewChild} />
      )}

      <section>
        <h3>
          Files <span className="muted small">({m.files.length})</span>
        </h3>
        {m.files.length === 0 ? (
          <div className="empty-files">
            <span>No logs imported into this session yet.</span>
            <button className="sm" onClick={() => setView('device')}>
              Go to Control Hub →
            </button>
          </div>
        ) : (
          <ul className="file-list">
            {m.files.map((f) => (
              <li key={f.filename}>
                <span className="kind-badge boxed">{kindBadge(f.kind)}</span>
                <span className="file-name">{f.filename}</span>
                <span className="mono small muted">{formatBytes(f.file_size_bytes)}</span>
                <span className="mono small muted">{formatTimestamp(f.imported_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Notes</h3>
        <textarea
          className="notes"
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          placeholder="Add notes about this session…"
        />
        <div className="notes-actions">
          <button
            className="sm"
            onClick={() => saveNotes.mutate(draftNotes)}
            disabled={saveNotes.isPending || draftNotes === (notes ?? '')}
          >
            {saveNotes.isPending ? 'Saving…' : 'Save notes'}
          </button>
        </div>
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
