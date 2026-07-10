import type { SessionType } from '../constants/sessionTypes'
import type { FileKind } from '../constants/fileKinds'

export type { SessionType, FileKind }

/** A file that lives inside a session folder (spec §4.1 / §5.2). */
export interface SessionFile {
  filename: string
  kind: FileKind
  source: string // e.g. 'control_hub' | 'manual' | 'usb_camera'
  imported_at: string
  recorded_at?: string | null
  remote_path?: string | null
  original_filename?: string | null
  file_size_bytes?: number | null
  // Future media-sync fields (spec §17) are preserved via passthrough.
  [extra: string]: unknown
}

/** FTCScout-owned event block (spec §5.1). */
export interface EventInfo {
  source?: string
  season?: number
  display_code?: string
  ftcscout_code?: string
  name?: string
  last_synced?: string
  has_matches?: boolean
  [extra: string]: unknown
}

/** FTCScout-owned match block (spec §5.2). */
export interface MatchInfo {
  source?: string
  label?: string
  type?: string
  number?: number
  /** Replay index when a match had to be re-run; absent for a first playing. */
  replay?: number
  alliance?: 'red' | 'blue' | string
  station?: string
  team_number?: number
  [extra: string]: unknown
}

/** General/workshop block (spec §5.4). */
export interface GeneralInfo {
  date?: string
  location?: string
  robot?: string
  [extra: string]: unknown
}

/** The full contents of a `session.json` (spec §4). */
export interface SessionMetadata {
  schema_version: number
  session_id: string
  session_type: SessionType
  display_name: string
  created_at: string
  updated_at: string
  session_start?: string | null
  session_end?: string | null
  sort_key?: string | null
  tags: string[]
  notes_file: string
  files: SessionFile[]
  event?: EventInfo
  match?: MatchInfo
  session?: GeneralInfo
  teams?: number[]
  // Unknown top-level keys are preserved on round-trip.
  [extra: string]: unknown
}

/** A resolved session (metadata + where it lives on disk). */
export interface Session {
  path: string // absolute folder path
  name: string // folder name
  metadata: SessionMetadata
  hasSessionJson: boolean // false ⇒ metadata is discovery defaults, not yet written
}

/**
 * A node in the session tree served to the renderer. Lightweight and derived
 * (rebuildable) — counts come from disk, not bookkeeping.
 */
export interface SessionNode {
  path: string
  name: string
  displayName: string
  sessionType: SessionType
  hasSessionJson: boolean
  fileCount: number
  logCount: number
  tags: string[]
  sortKey: string | null
  /** Match summary (present only for match-type sessions), so the match list can render without refetching. */
  match?: MatchInfo | null
  children: SessionNode[]
}

/** A file physically present in a folder on disk (whether or not it's tracked in session.json). */
export interface FolderFile {
  filename: string
  kind: FileKind
  sizeBytes: number | null
  /** True when the file is listed in the folder's `session.json` (imported/curated), not just loose on disk. */
  tracked: boolean
  /** RLOG-embedded metadata (Logger.recordMetadata), decoded from the file head; null for non-logs or logs without any. */
  metadata: Record<string, string> | null
}

/** Input for creating a new session folder. */
export interface CreateSessionInput {
  parentPath: string // absolute path of the parent folder (archive root or a session)
  displayName: string
  sessionType: SessionType
}

/** Content that will be removed by recursively deleting one session folder. */
export interface DeleteSessionSummary {
  path: string
  displayName: string
  /** All non-LogVue-plumbing files below the session, including notes. */
  fileCount: number
  /** All descendant folders, whether recognised sessions or bare grouping folders. */
  childFolderCount: number
}

export interface AppSettings {
  archiveRoot: string | null
  teamNumber: number | null
  hubDataSource: 'adb' | 'folder'
  hubLogFolder: string | null
  /** Ask before recursively deleting a session that contains files or child folders. */
  confirmDeletePopulatedSessions: boolean
}
