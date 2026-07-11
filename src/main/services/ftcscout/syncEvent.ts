import { join } from 'path'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import type { FtcScoutEventPayload, FtcScoutSyncRequest, FtcScoutSyncResult } from '@shared/types/ftcscout'
import type { SessionMetadata } from '@shared/types/session'
import { makeDefaultMetadata } from '@shared/schema/sessionJson'
import { formatMatchStation } from '@shared/format/match'
import { getSettings } from '../../config/settings'
import { getIndexStore, reindexSession } from '../index/indexService'
import { readMetadataOrDefault, writeMetadata } from '../archive/SessionStore'
import { toFolderName, uniqueChildDir } from '../archive/paths'
import { FtcScoutClient } from './FtcScoutClient'

interface SyncSource {
  event: FtcScoutEventPayload
  fromCache: boolean
}

/** Progress taps for the activity toast stack; the sync is unchanged without them. */
export interface SyncHooks {
  /** The matches we're about to scaffold, once the event has been fetched. */
  onPlan?(matches: Array<{ id: string; label: string }>): void
  onMatchDone?(id: string, outcome: 'created' | 'updated' | 'unchanged'): void
}

/** Let the main event loop flush queued IPC before the next synchronous match write. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export async function syncFtcScoutEvent(
  client: FtcScoutClient,
  req: FtcScoutSyncRequest,
  hooks?: SyncHooks
): Promise<FtcScoutSyncResult> {
  const root = getSettings().archiveRoot
  const store = getIndexStore(root)
  const code = req.eventCode.trim().toUpperCase()
  if (!root || !store) throw new Error('Choose a library folder before syncing FTCScout')
  if (!Number.isInteger(req.season) || req.season < 2000) throw new Error('Enter a valid FTCScout season')
  if (!code) throw new Error('Enter an FTCScout event code')
  if (!Number.isInteger(req.teamNumber) || req.teamNumber <= 0) throw new Error('Enter a valid team number')

  const source = await fetchWithCacheFallback(client, store, req, code)
  if (!existsSync(req.eventPath)) throw new Error('Competition session no longer exists')

  const eventSession = readMetadataOrDefault(req.eventPath)
  const eventMeta: SessionMetadata = {
    ...eventSession.metadata,
    session_type: 'competition_event',
    display_name: eventSession.metadata.display_name || source.event.name,
    session_start: eventSession.metadata.session_start ?? source.event.start ?? null,
    session_end: eventSession.metadata.session_end ?? source.event.end ?? null,
    sort_key: eventSession.metadata.sort_key ?? source.event.start ?? null,
    teams: uniq([...(eventSession.metadata.teams ?? []), req.teamNumber]),
    event: {
      ...eventSession.metadata.event,
      source: 'ftcscout',
      season: source.event.season,
      display_code: source.event.code,
      ftcscout_code: source.event.code,
      name: source.event.name,
      timezone: source.event.timezone,
      start: source.event.start,
      end: source.event.end,
      has_matches: source.event.hasMatches,
      last_synced: source.event.lastSynced
    }
  }
  writeMetadata(req.eventPath, eventMeta)

  const existing = officialMatchDirs(req.eventPath)
  let created = 0
  let updated = 0
  let unchanged = 0

  hooks?.onPlan?.(
    source.event.matches.map((m) => ({
      id: String(m.ftcscoutId),
      label: `${m.match.label ?? m.description} ${formatMatchStation(m.match)}`.trim()
    }))
  )

  for (const match of source.event.matches) {
    await tick()
    const existingDir = existing.get(match.ftcscoutId)
    const now = new Date().toISOString()
    const displayName = `${match.match.label ?? match.description} ${formatMatchStation(match.match)}`.trim()
    if (!existingDir) {
      const dir = uniqueChildDir(req.eventPath, toFolderName(displayName))
      mkdirSync(dir, { recursive: true })
      const metadata: SessionMetadata = {
        ...makeDefaultMetadata(displayName, now),
        session_type: 'official_match',
        display_name: displayName,
        session_start: match.actualStartTime ?? match.scheduledStartTime ?? null,
        sort_key: match.scheduledStartTime ?? match.actualStartTime ?? syntheticSortKey(source.event, match),
        tags: ['ftcscout'],
        event: eventMeta.event,
        match: match.match,
        teams: [req.teamNumber]
      }
      writeMetadata(dir, metadata)
      reindexSession(root, dir)
      created += 1
      hooks?.onMatchDone?.(String(match.ftcscoutId), 'created')
      continue
    }

    const { metadata } = readMetadataOrDefault(existingDir)
    const next: SessionMetadata = {
      ...metadata,
      session_type: 'official_match',
      display_name: metadata.display_name || displayName,
      session_start: metadata.session_start ?? match.actualStartTime ?? match.scheduledStartTime ?? null,
      sort_key: metadata.sort_key ?? match.scheduledStartTime ?? match.actualStartTime ?? syntheticSortKey(source.event, match),
      event: { ...metadata.event, ...eventMeta.event },
      match: { ...metadata.match, ...match.match },
      teams: uniq([...(metadata.teams ?? []), req.teamNumber]),
      tags: uniq([...(metadata.tags ?? []), 'ftcscout'])
    }
    if (JSON.stringify(metadata) === JSON.stringify(next)) {
      unchanged += 1
      hooks?.onMatchDone?.(String(match.ftcscoutId), 'unchanged')
    } else {
      writeMetadata(existingDir, next)
      updated += 1
      hooks?.onMatchDone?.(String(match.ftcscoutId), 'updated')
    }
    reindexSession(root, existingDir)
  }

  reindexSession(root, req.eventPath)
  return { event: source.event, teamNumber: req.teamNumber, fromCache: source.fromCache, created, updated, unchanged }
}

async function fetchWithCacheFallback(
  client: FtcScoutClient,
  store: NonNullable<ReturnType<typeof getIndexStore>>,
  req: FtcScoutSyncRequest,
  code: string
): Promise<SyncSource> {
  try {
    const event = await client.fetchEventForTeam(req.season, code, req.teamNumber)
    store.putFtcScoutEvent(event)
    return { event, fromCache: false }
  } catch (err) {
    const cached = store.getFtcScoutEvent(code, req.season)
    if (cached && req.allowCacheFallback !== false) {
      return {
        event: {
          ...cached,
          matches: cached.matches.filter((m) => m.match.team_number === req.teamNumber)
        },
        fromCache: true
      }
    }
    throw err
  }
}

function officialMatchDirs(eventPath: string): Map<number, string> {
  const out = new Map<number, string>()
  for (const entry of readdirSync(eventPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(eventPath, entry.name)
    const { metadata } = readMetadataOrDefault(dir)
    if (metadata.session_type !== 'official_match') continue
    const id = metadata.match?.ftcscout_id
    if (typeof id === 'number') out.set(id, dir)
  }
  return out
}

function syntheticSortKey(event: FtcScoutEventPayload, match: FtcScoutEventPayload['matches'][number]): string | null {
  if (!event.start) return null
  return `${event.start}#${String(match.ftcscoutId).padStart(6, '0')}`
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)]
}
