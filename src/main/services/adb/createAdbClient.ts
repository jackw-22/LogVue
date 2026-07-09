import { AdbClient, type AdbLike, type AdbTimeSample, type RemoteFile } from './AdbClient'
import { FAKE_ADB_HUB_ENV, FakeAdbClient } from './FakeAdbClient'
import type { AppSettings } from '@shared/types/session'
import type { AdbStatus } from '@shared/types/hublog'

export function createAdbClient(settings?: AppSettings): AdbLike {
  const fakeHubRoot = process.env[FAKE_ADB_HUB_ENV]
  if (settings?.hubDataSource === 'folder' && settings.hubLogFolder) {
    return new FakeAdbClient(settings.hubLogFolder, 0)
  }
  if (settings?.hubDataSource === 'folder') return new MissingHubLogFolderClient()
  return fakeHubRoot ? new FakeAdbClient(fakeHubRoot) : new AdbClient()
}

class MissingHubLogFolderClient implements AdbLike {
  async getStatus(): Promise<AdbStatus> {
    return { connected: false }
  }

  async listRemoteFiles(): Promise<RemoteFile[]> {
    return []
  }

  async pull(_remotePath: string, _destPath: string): Promise<void> {
    throw new Error('Choose a hub log folder before importing logs')
  }

  async getTimeSample(): Promise<AdbTimeSample> {
    const now = Date.now()
    return {
      localBeforeMs: now,
      localAfterMs: now,
      hubNowMs: now,
      hubTimezoneOffsetMinutes: null
    }
  }
}
