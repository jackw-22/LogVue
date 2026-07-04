import { execFile } from 'child_process'
import { promisify } from 'util'
import { RLOG_EXT, RLOG_ROOT } from '@shared/constants/adb'
import type { AdbStatus } from '@shared/types/hublog'
import { parseFindOutput, parseLsOutput, remoteBasename } from './parseLs'

const execFileAsync = promisify(execFile)

/** Thrown when `adb` isn't installed / on PATH (surfaced as a friendly hint in the UI). */
export class AdbNotFoundError extends Error {
  constructor() {
    super('adb executable not found on PATH')
    this.name = 'AdbNotFoundError'
  }
}

/** A remote `.rlog` file as discovered on the hub, before import-status resolution. */
export interface RemoteFile {
  remote_path: string
  filename: string
  file_size_bytes: number | null
}

/**
 * Wraps the *system* `adb` (ARCHITECTURE §7). Read-only and concurrency-safe:
 * `adb devices`, `adb shell ls/find`. We deliberately never run `kill-server` /
 * `start-server` — the FTC IDE likely owns the shared adb server and we must
 * coexist, attaching to whatever daemon is already running.
 */
export class AdbClient {
  /** Run a raw `adb` invocation. Maps a missing binary to {@link AdbNotFoundError}. */
  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('adb', args, {
        timeout: 15_000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true
      })
      return stdout
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new AdbNotFoundError()
      throw err
    }
  }

  /** Run a command inside the device shell as a single verbatim string (safe quoting). */
  private runShell(command: string): Promise<string> {
    return this.run(['shell', command])
  }

  /** `adb devices -l` → connection status + a friendly device label (spec §7.1). */
  async getStatus(): Promise<AdbStatus> {
    let stdout: string
    try {
      stdout = await this.run(['devices', '-l'])
    } catch (err) {
      if (err instanceof AdbNotFoundError) return { connected: false, adbMissing: true }
      // A transient adb hiccup (server busy, device settling) — report disconnected,
      // don't crash; the UI offers a manual retry.
      return { connected: false }
    }

    for (const raw of stdout.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('List of devices')) continue
      const tokens = line.split(/\s+/)
      const [serial, state] = tokens
      if (state !== 'device') continue // skip 'offline' / 'unauthorized'
      const model = tokens.find((t) => t.startsWith('model:'))?.slice('model:'.length)
      return { connected: true, device: model ? model.replace(/_/g, ' ') : serial }
    }
    return { connected: false }
  }

  /**
   * List `.rlog` files under the hub's log dir (spec §7.2). Prefers `ls -l` (one shot,
   * gives size), falling back to `find` (paths only, size unknown) when the listing
   * isn't parseable — tolerant of differing Android shells.
   */
  async listRemoteFiles(): Promise<RemoteFile[]> {
    const lsOut = await this.runShell(`ls -l '${RLOG_ROOT}'`).catch(() => '')
    // A missing directory prints an error to stdout on many devices — treat as empty.
    if (/no such file|not found|permission denied/i.test(lsOut)) {
      return this.findFallback()
    }
    const rlogs = parseLsOutput(lsOut).filter((e) => e.filename.toLowerCase().endsWith(RLOG_EXT))
    if (rlogs.length > 0) {
      return rlogs.map((e) => ({
        remote_path: `${RLOG_ROOT}/${e.filename}`,
        filename: e.filename,
        file_size_bytes: e.file_size_bytes
      }))
    }
    return this.findFallback()
  }

  private async findFallback(): Promise<RemoteFile[]> {
    const findOut = await this.runShell(`find '${RLOG_ROOT}' -name '*${RLOG_EXT}' -type f`).catch(
      () => ''
    )
    return parseFindOutput(findOut).map((path) => ({
      remote_path: path,
      filename: remoteBasename(path),
      file_size_bytes: null
    }))
  }
}
