import { useState } from 'react'
import { SELECTABLE_SESSION_TYPES, SESSION_TYPE_LABELS } from '@shared/constants/sessionTypes'
import type { SessionType } from '@shared/types/session'
import { useCreateSession } from '../api/hooks'
import { useAppStore } from '../stores/appStore'

interface Props {
  parentPath: string
  parentLabel: string
  onClose: () => void
}

export default function NewSessionDialog({ parentPath, parentLabel, onClose }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState<SessionType>('general_session')
  const create = useCreateSession()
  const select = useAppStore((s) => s.select)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const session = await create.mutateAsync({ parentPath, displayName: name.trim(), sessionType: type })
    select(session.path)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>New session</h2>
        <p className="muted small">Inside {parentLabel}</p>

        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Drivebase tuning after Q4"
          />
        </label>

        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as SessionType)}>
            {SELECTABLE_SESSION_TYPES.map((t) => (
              <option key={t} value={t}>
                {SESSION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
