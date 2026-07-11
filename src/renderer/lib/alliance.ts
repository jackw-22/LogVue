import type { FileKind } from '@shared/types/session'

/** CSS colour-class for an alliance value: `.red`, `.blue` or `.none`. */
export type AllianceClass = 'red' | 'blue' | 'none'

export function allianceClass(alliance: string | null | undefined): AllianceClass {
  if (alliance === 'red' || alliance === 'blue') return alliance
  return 'none'
}

/**
 * Best-effort alliance guess for a *remote* hub log, which carries no metadata yet —
 * purely a display hint (stripe colour) taken from the op-mode/filename wording.
 */
export function guessAlliance(opmode: string | null, filename: string): AllianceClass {
  const hay = `${opmode ?? ''} ${filename}`.toLowerCase()
  if (hay.includes('red')) return 'red'
  if (hay.includes('blue')) return 'blue'
  return 'none'
}

/** Compact uppercase badge for a file kind (the dashboard/file-list "AUTO"/"TELEOP" tags). */
export const FILE_KIND_BADGES: Record<FileKind, string> = {
  auto_log: 'AUTO',
  teleop_log: 'TELEOP',
  match_log: 'MATCH',
  practice_log: 'PRACTICE',
  tuning_log: 'TUNING',
  debug_log: 'DEBUG',
  crash_log: 'CRASH',
  test_log: 'TEST',
  video: 'VIDEO',
  screenshot: 'SHOT',
  advantage_scope_layout: 'LAYOUT',
  notes: 'NOTES',
  other: 'FILE'
}

export function kindBadge(kind: FileKind | string): string {
  return FILE_KIND_BADGES[kind as FileKind] ?? 'FILE'
}
