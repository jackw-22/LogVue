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
  Session,
  SessionMetadata,
  SessionNode
} from './session'
import type { AdbStatus, HubLog } from './hublog'
import type { SessionQuery, SessionQueryResult } from './query'
import type {
  HubLogRef,
  ImportRequest,
  ImportResult,
  NewSessionImportRequest,
  NewSessionImportResult
} from './import'

export interface AppInfo {
  appVersion: string
  electron: string
  chrome: string
  node: string
  platform: NodeJS.Platform
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

  // ── archive / sessions (disk-backed; source of truth) ──────
  /** The session tree beneath the archive root. */
  'archive:tree': () => Promise<SessionNode[]>
  'archive:getSession': (path: string) => Promise<Session>
  'archive:createSession': (input: CreateSessionInput) => Promise<Session>
  'archive:updateMeta': (path: string, patch: Partial<SessionMetadata>) => Promise<Session>
  /** Write a `session.json` for a bare folder using discovery defaults (spec §4.2). */
  'archive:promoteFolder': (path: string) => Promise<Session>
  'archive:readNotes': (path: string) => Promise<string>
  'archive:writeNotes': (path: string, md: string) => Promise<void>
  /** Rebuild the disposable sqlite index from a full disk rescan (spec §13). */
  'archive:rebuildIndex': () => Promise<{ sessions: number; files: number }>
  /** Filter/search sessions via the index; returns matches + whole-archive facets (spec §12). */
  'index:query': (query: SessionQuery) => Promise<SessionQueryResult>

  // ── ADB / Control Hub (read-only; spec §7) ─────────────────
  /** Connection status from `adb devices` (spec §7.1). */
  'adb:status': () => Promise<AdbStatus>
  /** List `.rlog` files on the hub with parsed metadata + import status (spec §7.2–7.3). */
  'adb:listHubLogs': () => Promise<HubLog[]>
  /** Mark a remote hub log as ignored — hidden from the default view (spec §15). */
  'adb:ignoreHubLog': (entry: HubLogRef) => Promise<void>
  /** Reverse an ignore (spec §15). */
  'adb:unignoreHubLog': (remotePath: string) => Promise<void>

  // ── import (pull → copy → append → index; spec §7.4, §14) ──
  /** Import a remote log into an existing session. `duplicate` when already imported. */
  'import:toSession': (req: ImportRequest) => Promise<ImportResult>
  /** Create a session from selected logs, then import them into it (spec §10). */
  'import:toNewSession': (req: NewSessionImportRequest) => Promise<NewSessionImportResult>
}

export type IpcChannel = keyof IpcApi
