import type { HubLog } from '@shared/types/hublog'
import type { SessionFile } from '@shared/types/session'

/** Local YYYY-MM-DD, used by the root-level date session quick-import target. */
export function dateSessionKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Choose the safe one-click catch-up set from hub logs ordered newest-first.
 * With import history, this is every untouched log newer than the latest imported
 * one. Without a boundary, import only the latest untouched log to avoid pulling
 * an unexpectedly large backlog.
 */
export function logsForQuickCatchUp(logs: HubLog[]): HubLog[] {
  const lastImportedIndex = logs.findIndex((log) => log.import_status.state === 'imported')
  if (lastImportedIndex < 0) {
    const latest = logs.find((log) => log.import_status.state === 'not_imported')
    return latest ? [latest] : []
  }
  return logs
    .slice(0, lastImportedIndex)
    .filter((log) => log.import_status.state === 'not_imported')
}

/** Latest recorded/imported time among RLOGs already in one session. */
export function latestSessionLogTime(files: SessionFile[]): number | null {
  let latest: number | null = null
  for (const file of files) {
    if (!file.filename.toLocaleLowerCase().endsWith('.rlog')) continue
    const timestamp = Date.parse(file.recorded_at ?? file.imported_at)
    if (Number.isFinite(timestamp) && (latest === null || timestamp > latest)) latest = timestamp
  }
  return latest
}

/** True when a session's newest RLOG predates the start of today's local calendar day. */
export function sessionLogIsFromEarlierDay(files: SessionFile[], now = new Date()): boolean {
  const latest = latestSessionLogTime(files)
  if (latest === null) return false
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return latest < startOfToday
}
