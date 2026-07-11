import { useEffect, useState } from 'react'
import type { Session } from '@shared/types/session'
import { useFtcScoutSync, useSetTeamNumber, useSettings } from '../api/hooks'

interface Props {
  session: Session
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

export default function FtcScoutSyncPanel({ session }: Props): JSX.Element {
  const { data: settings } = useSettings()
  const setTeamNumber = useSetTeamNumber()
  const sync = useFtcScoutSync()
  const [season, setSeason] = useState('')
  const [eventCode, setEventCode] = useState('')
  const [teamNumber, setTeamNumberDraft] = useState('')

  useEffect(() => {
    setSeason(String(session.metadata.event?.season ?? currentSeason()))
    setEventCode(session.metadata.event?.ftcscout_code ?? session.metadata.event?.display_code ?? '')
    setTeamNumberDraft(String(settings?.teamNumber ?? session.metadata.teams?.[0] ?? ''))
  }, [session.path, session.metadata.event, session.metadata.teams, settings?.teamNumber])

  const parsedSeason = Number(season)
  const parsedTeam = Number(teamNumber)
  const canSync =
    Number.isInteger(parsedSeason) &&
    parsedSeason >= 2000 &&
    eventCode.trim().length > 0 &&
    Number.isInteger(parsedTeam) &&
    parsedTeam > 0

  async function runSync(): Promise<void> {
    if (!canSync) return
    if (settings?.teamNumber !== parsedTeam) {
      await setTeamNumber.mutateAsync(parsedTeam)
    }
    await sync.mutateAsync({
      eventPath: session.path,
      season: parsedSeason,
      eventCode: eventCode.trim().toUpperCase(),
      teamNumber: parsedTeam,
      allowCacheFallback: true
    })
  }

  return (
    <section className="ftcscout-sync">
      <div className="section-head-row">
        <h3>FTCScout</h3>
        {session.metadata.event?.last_synced && (
          <span className="muted small">Synced {new Date(session.metadata.event.last_synced).toLocaleString()}</span>
        )}
      </div>

      <div className="ftcscout-grid">
        <label className="field">
          Season
          <input
            type="number"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="2026"
          />
        </label>
        <label className="field">
          Event code
          <input
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value.toUpperCase())}
            placeholder="APOC"
          />
        </label>
        <label className="field">
          Team #
          <input
            type="number"
            value={teamNumber}
            onChange={(e) => setTeamNumberDraft(e.target.value)}
            placeholder="12345"
          />
        </label>
        <div className="field action-field">
          <span>&nbsp;</span>
          <button onClick={runSync} disabled={!canSync || sync.isPending || setTeamNumber.isPending}>
            {sync.isPending ? 'Syncing…' : 'Sync matches'}
          </button>
        </div>
      </div>

      {sync.data && (
        <p className="muted small">
          {sync.data.fromCache ? 'Used cache. ' : ''}
          {sync.data.created} created, {sync.data.updated} updated, {sync.data.unchanged} unchanged.
        </p>
      )}
      {sync.error instanceof Error && <p className="error-text small">{sync.error.message}</p>}
    </section>
  )
}
