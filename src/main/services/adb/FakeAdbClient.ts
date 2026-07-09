import { copyFile, readdir, stat } from 'fs/promises'
import { join, relative, sep } from 'path'
import { posix } from 'path'
import { RLOG_EXT, RLOG_ROOT } from '@shared/constants/adb'
import type { AdbStatus } from '@shared/types/hublog'
import type { AdbLike, AdbTimeSample, RemoteFile } from './AdbClient'

export const FAKE_ADB_HUB_ENV = 'LOGVUE_FAKE_ADB_HUB'
export const FAKE_ADB_TIME_OFFSET_MS = 5 * 60 * 1000

/**
 * Test double for UI/e2e tests. Treats a local directory as the Control Hub log
 * directory and exposes the same read-only surface as the real adb wrapper.
 */
export class FakeAdbClient implements AdbLike {
  constructor(
    private readonly hubRoot: string,
    private readonly timeOffsetMs = FAKE_ADB_TIME_OFFSET_MS
  ) {}

  async getStatus(): Promise<AdbStatus> {
    return { connected: true, device: 'Fake Control Hub' }
  }

  async listRemoteFiles(): Promise<RemoteFile[]> {
    const files = await this.walk(this.hubRoot)
    return Promise.all(
      files
        .filter((path) => path.toLowerCase().endsWith(RLOG_EXT))
        .map(async (path): Promise<RemoteFile> => {
          const rel = toRemoteRelativePath(relative(this.hubRoot, path))
          const filename = posix.basename(rel)
          const info = await stat(path)
          return {
            remote_path: `${RLOG_ROOT}/${rel}`,
            filename,
            file_size_bytes: info.size
          }
        })
    )
  }

  async pull(remotePath: string, destPath: string): Promise<void> {
    const source = this.localPathForRemote(remotePath)
    await copyFile(source, destPath)
  }

  async getTimeSample(): Promise<AdbTimeSample> {
    const now = Date.now()
    return {
      localBeforeMs: now,
      localAfterMs: now,
      hubNowMs: now - this.timeOffsetMs,
      hubTimezoneOffsetMinutes: null
    }
  }

  private async walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return []
      throw err
    })
    const files = await Promise.all(
      entries.map(async (entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return this.walk(path)
        return entry.isFile() ? [path] : []
      })
    )
    return files.flat()
  }

  private localPathForRemote(remotePath: string): string {
    const prefix = `${RLOG_ROOT}/`
    if (!remotePath.startsWith(prefix)) {
      throw new Error(`Fake adb remote path must start with ${prefix}: ${remotePath}`)
    }

    const rel = remotePath.slice(prefix.length)
    const normalized = posix.normalize(rel)
    if (normalized.startsWith('../') || normalized === '..' || posix.isAbsolute(normalized)) {
      throw new Error(`Fake adb remote path escapes hub root: ${remotePath}`)
    }
    return join(this.hubRoot, ...normalized.split('/'))
  }
}

function toRemoteRelativePath(path: string): string {
  return path.split(sep).join('/')
}
