import { chmodSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'

/**
 * Best-effort removal of temp files a crashed/interrupted earlier write left
 * behind (`<file>.<pid>.tmp`). LogVue is single-instance, so anything matching
 * the pattern is stale by the time another write for the same target runs.
 * Failures are ignored: cleanup must never block the write itself.
 */
function removeStaleTempFiles(file: string): void {
  const prefix = `${basename(file)}.`
  try {
    for (const name of readdirSync(dirname(file))) {
      if (name.startsWith(prefix) && name.endsWith('.tmp')) {
        rmSync(join(dirname(file), name), { force: true })
      }
    }
  } catch {
    // Directory unreadable — the write below will surface the real problem.
  }
}

/**
 * Write a file via a same-directory temp file + rename, so no concurrent reader
 * (the tree scan, the index rebuild, an MCP agent, or the archive watcher) can
 * ever observe a half-written file. The `.tmp` suffix is excluded from listings,
 * indexing, and watching (`isTransientArtifact`); rename replaces the target in
 * one step on POSIX and Windows.
 *
 * An existing target's permission bits are re-applied to the replacement inode
 * (rename would otherwise silently reset a 0600 or group-shared file to the
 * process umask). Extended ACLs beyond the mode bits are not preserved.
 */
export function writeFileAtomic(file: string, data: string): void {
  removeStaleTempFiles(file)

  let existingMode: number | null = null
  try {
    existingMode = statSync(file).mode & 0o7777
  } catch {
    existingMode = null // New file — default creation mode applies.
  }

  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data, 'utf-8')
  try {
    // chmod (unlike the open(2) mode argument) is not masked by the umask.
    if (existingMode !== null) chmodSync(tmp, existingMode)
    renameSync(tmp, file)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}
