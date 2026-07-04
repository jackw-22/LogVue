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
}

export type IpcChannel = keyof IpcApi
