/**
 * Parse a Control Hub `.rlog` filename into its op-mode and timestamp (spec §7.3).
 * Pure and tolerant — filenames vary, so anything unrecognised degrades to
 * `{ opmode: <best guess>, parsed_timestamp: null }` rather than throwing. Isolated
 * here so it's unit-testable against captured real-device names.
 *
 * Canonical form:  `<OpMode>_log_YYYYMMDD_HHMMSS_mmm.rlog`
 *   e.g. `BlueOpMode_log_20260704_115005_104.rlog`
 *     → opmode "BlueOpMode", timestamp "2026-07-04T11:50:05.104"
 */
export interface ParsedRlog {
  opmode: string | null
  parsed_timestamp: string | null
}

// <opmode> (greedy up to the last `_log_`) then the timestamp triplet.
const FULL = /^(.+)_log_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})\.rlog$/i
// Fallback: opmode before `_log_`, timestamp not in the expected shape.
const OPMODE_ONLY = /^(.+)_log_.*\.rlog$/i
const ANY_RLOG = /^(.+)\.rlog$/i

export function parseRlogFilename(filename: string): ParsedRlog {
  const full = FULL.exec(filename)
  if (full) {
    const [, opmode, y, mo, d, h, mi, s, ms] = full
    return {
      opmode,
      parsed_timestamp: `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}`
    }
  }
  const named = OPMODE_ONLY.exec(filename)
  if (named) return { opmode: named[1], parsed_timestamp: null }

  const anyRlog = ANY_RLOG.exec(filename)
  if (anyRlog) return { opmode: anyRlog[1], parsed_timestamp: null }

  return { opmode: null, parsed_timestamp: null }
}
