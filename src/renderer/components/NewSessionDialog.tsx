import { useMemo, useState } from 'react'
import { SELECTABLE_SESSION_TYPES, SESSION_TYPE_LABELS } from '@shared/constants/sessionTypes'
import type { SessionType } from '@shared/types/session'
import type { FtcScoutEventSearchResult } from '@shared/types/ftcscout'
import {
  useCreateSession,
  useFtcScoutEventSearch,
  useFtcScoutSync,
  useSetTeamNumber,
  useSettings
} from '../api/hooks'
import { useAppStore } from '../stores/appStore'

interface Props {
  parentPath: string
  parentLabel: string
  onClose: () => void
}

type Mode = 'manual' | 'date' | 'ftcscout'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

function formatEventDates(event: FtcScoutEventSearchResult): string {
  if (event.start && event.end && event.start !== event.end) return `${event.start} → ${event.end}`
  return event.start ?? event.end ?? 'date unknown'
}

export default function NewSessionDialog({ parentPath, parentLabel, onClose }: Props): JSX.Element {
  const { data: settings } = useSettings()
  const [mode, setMode] = useState<Mode>('manual')
  const [name, setName] = useState('')
  const [type, setType] = useState<SessionType>('general_session')
  const [date, setDate] = useState(today())
  const [dateLabel, setDateLabel] = useState('')
  const [season, setSeason] = useState(String(currentSeason()))
  const [eventSearch, setEventSearch] = useState('')
  const [teamNumber, setTeamNumberDraft] = useState(String(settings?.teamNumber ?? ''))
  const [onlyTeamEvents, setOnlyTeamEvents] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<FtcScoutEventSearchResult | null>(null)

  const create = useCreateSession()
  const sync = useFtcScoutSync()
  const setTeamNumber = useSetTeamNumber()
  const select = useAppStore((s) => s.select)

  const parsedSeason = Number(season)
  const parsedTeam = Number(teamNumber)
  const searchQuery = useMemo(
    () => ({
      season: Number.isInteger(parsedSeason) ? parsedSeason : currentSeason(),
      searchText: eventSearch.trim(),
      teamNumber: Number.isInteger(parsedTeam) && parsedTeam > 0 ? parsedTeam : null,
      onlyTeamEvents,
      limit: 20
    }),
    [parsedSeason, parsedTeam, eventSearch, onlyTeamEvents]
  )
  const events = useFtcScoutEventSearch(
    searchQuery,
    mode === 'ftcscout' && Number.isInteger(parsedSeason) && parsedSeason >= 2000 && eventSearch.trim().length >= 2
  )

  const running = create.isPending || sync.isPending || setTeamNumber.isPending
  const dateDisplayName = [date, dateLabel.trim()].filter(Boolean).join(' ')
  const canCreate =
    mode === 'manual'
      ? !!name.trim()
      : mode === 'date'
        ? !!date
        : !!selectedEvent && Number.isInteger(parsedTeam) && parsedTeam > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canCreate) return

    if (mode === 'manual') {
      const session = await create.mutateAsync({
        parentPath,
        displayName: name.trim(),
        sessionType: type
      })
      select(session.path)
      onClose()
      return
    }

    if (mode === 'date') {
      const session = await create.mutateAsync({
        parentPath,
        displayName: dateDisplayName,
        sessionType: 'general_session'
      })
      select(session.path)
      onClose()
      return
    }

    if (!selectedEvent) return
    if (settings?.teamNumber !== parsedTeam) await setTeamNumber.mutateAsync(parsedTeam)
    const session = await create.mutateAsync({
      parentPath,
      displayName: selectedEvent.name,
      sessionType: 'competition_event'
    })
    await sync.mutateAsync({
      eventPath: session.path,
      season: selectedEvent.season,
      eventCode: selectedEvent.code,
      teamNumber: parsedTeam,
      allowCacheFallback: true
    })
    select(session.path)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal import-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Add session</h2>
        <p className="muted small">Inside {parentLabel}</p>

        <div className="seg" role="tablist">
          <button
            type="button"
            className={`seg-btn ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            Manual session
          </button>
          <button
            type="button"
            className={`seg-btn ${mode === 'date' ? 'active' : ''}`}
            onClick={() => setMode('date')}
          >
            Date folder
          </button>
          <button
            type="button"
            className={`seg-btn ${mode === 'ftcscout' ? 'active' : ''}`}
            onClick={() => setMode('ftcscout')}
          >
            FTCScout event
          </button>
        </div>

        {mode === 'manual' && (
          <>
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
          </>
        )}

        {mode === 'date' && (
          <>
            <label>
              Date
              <input autoFocus type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Folder label
              <input
                value={dateLabel}
                onChange={(e) => setDateLabel(e.target.value)}
                placeholder="e.g. Workshop testing"
              />
            </label>
          </>
        )}

        {mode === 'ftcscout' && (
          <>
            <div className="ftcscout-dialog-grid">
              <label>
                Season
                <input
                  autoFocus
                  type="number"
                  value={season}
                  onChange={(e) => {
                    setSeason(e.target.value)
                    setSelectedEvent(null)
                  }}
                />
              </label>
              <label>
                Team #
                <input
                  type="number"
                  value={teamNumber}
                  onChange={(e) => setTeamNumberDraft(e.target.value)}
                  placeholder="12345"
                />
              </label>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={onlyTeamEvents}
                onChange={(e) => {
                  setOnlyTeamEvents(e.target.checked)
                  setSelectedEvent(null)
                }}
              />
              Only events with this team
            </label>
            <label>
              Search events
              <input
                value={eventSearch}
                onChange={(e) => {
                  setEventSearch(e.target.value)
                  setSelectedEvent(null)
                }}
                placeholder="Event name, city, or code"
              />
            </label>

            <div className="event-search-list">
              {events.isFetching && <p className="muted small">Searching FTCScout…</p>}
              {events.error instanceof Error && <p className="error-text small">{events.error.message}</p>}
              {!events.isFetching && eventSearch.trim().length < 2 && (
                <p className="muted small">Type at least two characters to search.</p>
              )}
              {(events.data ?? []).map((event) => (
                <button
                  type="button"
                  key={`${event.season}-${event.code}`}
                  className={`event-result ${selectedEvent?.code === event.code ? 'active' : ''}`}
                  onClick={() => setSelectedEvent(event)}
                >
                  <span className="event-result-main">
                    <strong>{event.name}</strong>
                    <span className="mono small">{event.code}</span>
                  </span>
                  <span className="muted small">
                    {formatEventDates(event)}
                    {event.locationLabel ? ` · ${event.locationLabel}` : ''}
                  </span>
                </button>
              ))}
              {!events.isFetching && eventSearch.trim().length >= 2 && events.data?.length === 0 && (
                <p className="muted small">No matching events.</p>
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={running || !canCreate}>
            {running ? 'Creating…' : mode === 'ftcscout' ? 'Create and sync' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
