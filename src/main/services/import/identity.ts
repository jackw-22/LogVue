import type { HubLogRef, ImportedFileLocation } from '@shared/types/import'

/**
 * An existing import's identity fields, as joined out of the index (`files` +
 * `sessions`). Shape returned by `IndexStore.importsOf`.
 */
export interface ImportIdentity {
  remote_path: string | null
  original_filename: string | null
  file_size_bytes: number | null
  filename: string
  sessionPath: string
  sessionLabel: string
}

/**
 * Existing imports that are "the same file" as `ref` (spec §14): identity =
 * remote_path + original filename + size. Pure, so duplicate detection is
 * unit-testable without the native index.
 *
 * Size is a *soft* signal: the hub's `find` fallback can't report a size, so a
 * missing size on either side doesn't veto a match — remote_path + filename still do.
 */
export function findDuplicates(ref: HubLogRef, existing: ImportIdentity[]): ImportedFileLocation[] {
  return existing
    .filter(
      (e) =>
        e.remote_path === ref.remotePath &&
        (e.original_filename ?? e.filename) === ref.filename &&
        (ref.fileSize == null || e.file_size_bytes == null || e.file_size_bytes === ref.fileSize)
    )
    .map((e) => ({ sessionPath: e.sessionPath, sessionLabel: e.sessionLabel, filename: e.filename }))
}
