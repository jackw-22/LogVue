import { useEffect, useState } from 'react'
import { SESSION_TYPES, SESSION_TYPE_LABELS } from '@shared/constants/sessionTypes'
import { FILE_KIND_LABELS } from '@shared/constants/fileKinds'
import { isMatchType } from '@shared/constants/matchTypes'
import type { FileKind, SessionType } from '@shared/types/session'
import { useNotes, usePromoteFolder, useSession, useUpdateMeta, useWriteNotes } from '../api/hooks'
import MatchInfoEditor from './MatchInfoEditor'
import MatchList from './MatchList'

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

  return (
    <div className="details">
      <div className="details-head">
        <input
          className="title-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== m.display_name && update.mutate({ display_name: name.trim() })}
        />
        <code className="details-path">{session.name}</code>
      </div>

      {!session.hasSessionJson && (
        <div className="callout">
          This folder has no <code>session.json</code> yet.
          <button className="sm" onClick={() => promote.mutate()} disabled={promote.isPending}>
            Recognise as session
          </button>
        </div>
      )}

      <div className="field-row">
        <label className="field">
          Type
          <select
            value={m.session_type}
            onChange={(e) => update.mutate({ session_type: e.target.value as SessionType })}
          >
            {SESSION_TYPES.map((t) => (
              <option key={t} value={t}>
                {SESSION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="field grow">
          Tags (comma-separated)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => update.mutate({ tags: parsedTags })}
            placeholder="swerve, localization"
          />
        </label>
      </div>

      {isMatchType(m.session_type) && <MatchInfoEditor path={path} match={m.match} />}

      {m.session_type === 'competition_event' && (
        <MatchList eventPath={path} onCreateChild={onNewChild} />
      )}

      <section>
        <h3>
          Files <span className="muted small">({m.files.length})</span>
        </h3>
        {m.files.length === 0 ? (
          <p className="muted small">
            No files yet. Import logs from the Control Hub tab, selecting this session as the target.
          </p>
        ) : (
          <ul className="file-list">
            {m.files.map((f) => (
              <li key={f.filename}>
                <span className="file-name">{f.filename}</span>
                <span className="chip">{FILE_KIND_LABELS[f.kind as FileKind] ?? f.kind}</span>
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
          placeholder="# Notes for this session…"
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
