import type { FileKind } from '@shared/constants/fileKinds'

/**
 * Guess a {@link FileKind} for a freshly-imported file from its name (spec §6 —
 * kinds are guessable from the filename and user-overridable). Pure, so it's
 * unit-testable against real op-mode names. The first keyword to match wins, so
 * order encodes precedence (a "crash" always beats a generic log).
 *
 * Non-`.rlog` files fall to media/notes/crash by extension; an unclassifiable
 * `.rlog` defaults to `match_log`, the most common capture at a competition (the
 * primary import scenario) — the user can always change it.
 */
export function guessFileKind(filename: string): FileKind {
  const lower = filename.toLowerCase()

  if (lower.includes('crash')) return 'crash_log'

  if (!lower.endsWith('.rlog')) {
    if (/\.(mp4|mov|mkv|avi|webm)$/.test(lower)) return 'video'
    if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return 'screenshot'
    if (/\.(md|txt)$/.test(lower)) return 'notes'
    return 'other'
  }

  if (lower.includes('auto')) return 'auto_log'
  if (lower.includes('teleop') || lower.includes('tele')) return 'teleop_log'
  if (lower.includes('tuning') || lower.includes('tune')) return 'tuning_log'
  if (lower.includes('practice')) return 'practice_log'
  if (lower.includes('debug')) return 'debug_log'
  if (lower.includes('test')) return 'test_log'
  return 'match_log'
}
