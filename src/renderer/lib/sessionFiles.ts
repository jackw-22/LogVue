import type { FolderFile, SessionFile } from '@shared/types/session'

export type SessionFileSort = 'alphabetical' | 'oldest'

const RLOG_TIMESTAMP_RE = /^.+_log_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})(?:_\d+)?\.rlog$/i

function validTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function filenameTimestamp(filename: string): number | null {
  const match = RLOG_TIMESTAMP_RE.exec(filename)
  if (!match) return null
  const [, year, month, day, hour, minute, second, millis] = match
  const parts = [year, month, day, hour, minute, second, millis].map(Number)
  const [y, mo, d, h, mi, s, ms] = parts
  const timestamp = Date.UTC(y, mo - 1, d, h, mi, s, ms)
  const parsed = new Date(timestamp)
  const valid =
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === mo - 1 &&
    parsed.getUTCDate() === d &&
    parsed.getUTCHours() === h &&
    parsed.getUTCMinutes() === mi &&
    parsed.getUTCSeconds() === s &&
    parsed.getUTCMilliseconds() === ms
  return valid ? timestamp : null
}

/** Recorded time first, then filename time, import time, and finally filesystem time. */
export function sessionFileTimestamp(file: FolderFile, tracked?: SessionFile): number | null {
  return (
    validTimestamp(tracked?.recorded_at) ??
    filenameTimestamp(file.filename) ??
    validTimestamp(tracked?.imported_at) ??
    validTimestamp(file.modifiedAt)
  )
}

export function sortSessionFiles(
  files: FolderFile[],
  trackedFiles: SessionFile[],
  sort: SessionFileSort
): FolderFile[] {
  const trackedByName = new Map(trackedFiles.map((file) => [file.filename, file]))
  return [...files].sort((a, b) => {
    if (sort === 'oldest') {
      const aTime = sessionFileTimestamp(a, trackedByName.get(a.filename))
      const bTime = sessionFileTimestamp(b, trackedByName.get(b.filename))
      if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime
      if (aTime !== null && bTime === null) return -1
      if (aTime === null && bTime !== null) return 1
    }
    return a.filename.localeCompare(b.filename)
  })
}
