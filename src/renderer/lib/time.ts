/** `2026-07-04T11:50:05.104` / `…05.104Z` → `2026-07-04 11:50:05` (drop millis/zone for readability). */
export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—'
  return ts.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '')
}

/** Coarse relative age — `12m ago`, `3h ago`, `5d ago` — for the "Latest" jump button. */
export function formatRelative(ts: string): string {
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
