/**
 * Types for the ADB / Control Hub side of the app (spec §7, ARCHITECTURE §4).
 * A `HubLog` is a *remote* file living on the hub — it becomes a `SessionFile`
 * only once imported (Phase 3). Import status is resolved against the index.
 */

/** Whether a remote hub log has already been imported, ignored, or is untouched. */
export type ImportStatus =
  | { state: 'not_imported' }
  | { state: 'ignored' }
  | { state: 'imported'; sessionPath: string; sessionLabel: string }

/** A `.rlog` file discovered on the Control Hub, plus parsed metadata + status. */
export interface HubLog {
  remote_path: string
  filename: string
  /** Op-mode name parsed from the filename, or null if unrecognised. */
  opmode: string | null
  /** ISO-ish local timestamp parsed from the filename (`YYYY-MM-DDTHH:MM:SS.mmm`), or null. */
  parsed_timestamp: string | null
  file_size_bytes: number | null
  import_status: ImportStatus
}

/** Result of `adb devices` (spec §7.1). */
export interface AdbStatus {
  connected: boolean
  /** Model/serial of the connected device, when one is present. */
  device?: string
  /** True when `adb` itself isn't installed/on PATH — the UI shows an install hint. */
  adbMissing?: boolean
}
