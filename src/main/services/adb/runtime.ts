import { getSettings } from '../../config/settings'
import type { AdbLike } from './AdbClient'
import { createAdbClient } from './createAdbClient'

/** Shared ADB client used by every application adapter (Electron IPC and MCP). */
let adb: AdbLike = createAdbClient(getSettings())

export function getAdbClient(): AdbLike {
  return adb
}

export function refreshAdbClient(): void {
  adb = createAdbClient(getSettings())
}
