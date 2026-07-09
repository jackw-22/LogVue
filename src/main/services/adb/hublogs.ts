import type { HubLog, ImportStatus } from '@shared/types/hublog'
import { getIndexStore } from '../index/indexService'
import type { AdbLike, RemoteFile } from './AdbClient'
import { parseRlogFilename } from './rlogFilename'

const NOT_IMPORTED: ImportStatus = { state: 'not_imported' }

/**
 * Turn raw remote files into display-ready {@link HubLog}s: parse opmode/timestamp
 * from each filename and resolve import status via the injected `resolve` fn.
 * Pure (given a resolver) so it's unit-testable without adb or the native index.
 * Sorted newest-first by parsed timestamp, unparsed timestamps last.
 */
export function assembleHubLogs(
  files: RemoteFile[],
  resolve: (remotePath: string) => ImportStatus
): HubLog[] {
  return files
    .map((f): HubLog => {
      const { opmode, parsed_timestamp } = parseRlogFilename(f.filename)
      return {
        remote_path: f.remote_path,
        filename: f.filename,
        opmode,
        parsed_timestamp,
        file_size_bytes: f.file_size_bytes,
        import_status: resolve(f.remote_path)
      }
    })
    .sort((a, b) => {
      if (a.parsed_timestamp && b.parsed_timestamp) {
        return a.parsed_timestamp < b.parsed_timestamp ? 1 : -1 // newest first
      }
      if (a.parsed_timestamp) return -1
      if (b.parsed_timestamp) return 1
      return a.filename.localeCompare(b.filename)
    })
}

/**
 * Full `adb:listHubLogs` flow: discover remote `.rlog` files and resolve each one's
 * import status against the index for `archiveRoot`. The index is disposable, so a
 * missing/unavailable one just yields `not_imported` for everything.
 */
export async function listHubLogs(
  adb: AdbLike,
  archiveRoot: string | null | undefined
): Promise<HubLog[]> {
  const files = await adb.listRemoteFiles()
  const store = getIndexStore(archiveRoot)
  const resolve = store ? (rp: string) => store.importStatusFor(rp) : () => NOT_IMPORTED
  return assembleHubLogs(files, resolve)
}
