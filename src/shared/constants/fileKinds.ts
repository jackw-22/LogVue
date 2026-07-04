/** File kinds (spec §6). Guessable from filename, user-overridable. */
export const FILE_KINDS = [
  'auto_log',
  'teleop_log',
  'match_log',
  'practice_log',
  'tuning_log',
  'debug_log',
  'crash_log',
  'test_log',
  'video',
  'screenshot',
  'advantage_scope_layout',
  'notes',
  'other'
] as const

export type FileKind = (typeof FILE_KINDS)[number]

/** Kinds that count as "logs" for the tree's "N logs" badge. */
export const LOG_KINDS: ReadonlySet<FileKind> = new Set([
  'auto_log',
  'teleop_log',
  'match_log',
  'practice_log',
  'tuning_log',
  'debug_log',
  'test_log'
])

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  auto_log: 'Auto log',
  teleop_log: 'TeleOp log',
  match_log: 'Match log',
  practice_log: 'Practice log',
  tuning_log: 'Tuning log',
  debug_log: 'Debug log',
  crash_log: 'Crash log',
  test_log: 'Test log',
  video: 'Video',
  screenshot: 'Screenshot',
  advantage_scope_layout: 'AdvantageScope layout',
  notes: 'Notes',
  other: 'Other'
}
