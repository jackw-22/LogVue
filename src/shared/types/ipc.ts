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
}

export type IpcChannel = keyof IpcApi
