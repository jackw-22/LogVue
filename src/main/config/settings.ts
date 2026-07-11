import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { app } from 'electron'
import { DEFAULT_ADB_ADDRESS } from '@shared/constants/adb'
import type { AppSettings } from '@shared/types/session'

const DEFAULTS: AppSettings = {
  archiveRoot: null,
  teamNumber: null,
  adbAddress: DEFAULT_ADB_ADDRESS,
  hubDataSource: 'adb',
  hubLogFolder: null,
  folderTimeOffsetMinutes: 0,
  confirmDeletePopulatedSessions: true
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  const file = settingsPath()
  if (!existsSync(file)) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(file, 'utf-8')) as Partial<AppSettings>) }
  } catch {
    // Corrupt settings shouldn't brick the app — fall back to defaults.
    return { ...DEFAULTS }
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2) + '\n', 'utf-8')
  return next
}
