/**
 * The IPC contract — the single source of truth for what the app can do.
 *
 * Each entry is `channel: (request) => Promise<response>`. `main/ipc/registry.ts`
 * implements exactly these; `preload` exposes a typed `invoke` over them; the
 * renderer calls them through `window.api.invoke`. Adding a capability = adding
 * one entry here (see ARCHITECTURE.md §5).
 *
 * Phase 0 only defines the smoke-test channels that prove the wiring end-to-end.
 */

import type {
  AppSettings,
  CreateSessionInput,
  DeleteSessionSummary,
  FolderFile,
  Session,
  SessionMetadata,
  SessionNode
} from './session'
import type { AdbStatus, HubLog, HubTimeSample } from './hublog'
import type { LogQueryRow, SessionQuery, SessionQueryResult } from './query'
import type {
  BatchImportRequest,
  HubLogRef,
  ImportRequest,
  ImportResult,
  NewSessionImportRequest,
  NewSessionImportResult
} from './import'
import type { Task } from './tasks'
import type {
  FtcScoutEventSearchRequest,
  FtcScoutEventSearchResult,
  FtcScoutSyncRequest,
  FtcScoutSyncResult
} from './ftcscout'

export interface AppInfo {
  appVersion: string
  electron: string
  chrome: string
  node: string
  platform: NodeJS.Platform
}

export interface ArchiveChangedEvent {
  root: string
  paths: string[]
  reason: 'archive_changed'
}

export interface IpcApi {
  /** Round-trip smoke test: renderer → main → renderer. */
  'app:ping': (msg: string) => Promise<string>
  /** Versions/platform, proving main can answer typed queries. */
  'app:getInfo': () => Promise<AppInfo>

  // ── settings / archive root ────────────────────────────────
  'settings:get': () => Promise<AppSettings>
  /** Native directory picker; returns the chosen path or null if cancelled. */
  'settings:pickArchiveRoot': () => Promise<string | null>
  'settings:setArchiveRoot': (path: string) => Promise<AppSettings>
  'settings:setTeamNumber': (teamNumber: number | null) => Promise<AppSettings>
  'settings:pickHubLogFolder': () => Promise<string | null>
  'settings:setHubDataSource': (source: AppSettings['hubDataSource']) => Promise<AppSettings>
  'settings:setHubLogFolder': (path: string | null) => Promise<AppSettings>
  'settings:setConfirmDeletePopulatedSessions': (confirm: boolean) => Promise<AppSettings>

  // ── archive / sessions (disk-backed; source of truth) ──────
  /** The session tree beneath the archive root. */
  'archive:tree': () => Promise<SessionNode[]>
  'archive:getSession': (path: string) => Promise<Session>
  /** The files physically inside a folder/session on disk — lets you see logs without importing. */
  'archive:listFiles': (path: string) => Promise<FolderFile[]>
  /** Reveal a session folder in the OS file manager. */
  'archive:showFolder': (path: string) => Promise<void>
  /** Reveal a session file in the OS file manager. */
  'archive:showFile': (path: string, filename: string) => Promise<void>
  /** Open a session file with the operating system's registered handler. */
  'archive:openFile': (path: string, filename: string) => Promise<void>
  'archive:createSession': (input: CreateSessionInput) => Promise<Session>
  'archive:updateMeta': (path: string, patch: Partial<SessionMetadata>) => Promise<Session>
  /** Recursively count the user data that deleting this session would remove. */
  'archive:deleteSessionSummary': (path: string) => Promise<DeleteSessionSummary>
  /** Permanently delete a session folder and all descendants. */
  'archive:deleteSession': (path: string) => Promise<DeleteSessionSummary>
  /** Write a `session.json` for a bare folder using discovery defaults (spec §4.2). */
  'archive:promoteFolder': (path: string) => Promise<Session>
  'archive:readNotes': (path: string) => Promise<string>
  'archive:writeNotes': (path: string, md: string) => Promise<void>
  /** Rebuild the disposable sqlite index from a full disk rescan (spec §13). */
  'archive:rebuildIndex': () => Promise<{ sessions: number; files: number }>
  /** Filter/search sessions via the index; returns matches + whole-archive facets (spec §12). */
  'index:query': (query: SessionQuery) => Promise<SessionQueryResult>
  /** Log-level filter/search — every imported log matching the query, newest-first (quick-find). */
  'index:queryLogs': (query: SessionQuery) => Promise<LogQueryRow[]>
  /** Total bytes of every indexed file — the library size pill on the tree root. */
  'index:librarySize': () => Promise<number>

  // ── ADB / Control Hub (read-only; spec §7) ─────────────────
  /** Connection status from `adb devices` (spec §7.1). */
  'adb:status': () => Promise<AdbStatus>
  /** List `.rlog` files on the hub with parsed metadata + import status (spec §7.2–7.3). */
  'adb:listHubLogs': () => Promise<HubLog[]>
  /** Current Control Hub clock sampled over adb, with local-clock offset. */
  'adb:getHubTime': () => Promise<HubTimeSample>
  /** Mark a remote hub log as ignored — hidden from the default view (spec §15). */
  'adb:ignoreHubLog': (entry: HubLogRef) => Promise<void>
  /** Reverse an ignore (spec §15). */
  'adb:unignoreHubLog': (remotePath: string) => Promise<void>

  // ── import (pull → copy → append → index; spec §7.4, §14) ──
  /** Import a remote log into an existing session. `duplicate` when already imported. */
  'import:toSession': (req: ImportRequest) => Promise<ImportResult>
  /**
   * Import several logs into one existing session. The loop lives in main so the whole
   * batch is a single progress task; a failed file yields a `failed` result rather than
   * abandoning the ones behind it. One result per requested log, in order.
   */
  'import:batchToSession': (req: BatchImportRequest) => Promise<ImportResult[]>
  /** Create a session from selected logs, then import them into it (spec §10). */
  'import:toNewSession': (req: NewSessionImportRequest) => Promise<NewSessionImportResult>

  // ── background tasks (activity toasts) ─────────────────────
  /** Live + recently-finished tasks; replayed when a renderer mounts mid-flight. */
  'tasks:list': () => Promise<Task[]>

  // ── FTCScout (online fetch + sqlite cache; spec competition workflow) ──
  /** Search FTCScout events by name/code for the add-session dialog. */
  'ftcscout:searchEvents': (req: FtcScoutEventSearchRequest) => Promise<FtcScoutEventSearchResult[]>
  /** Sync team-specific official matches into an existing competition_event session. */
  'ftcscout:syncEvent': (req: FtcScoutSyncRequest) => Promise<FtcScoutSyncResult>
}

export type IpcChannel = keyof IpcApi
