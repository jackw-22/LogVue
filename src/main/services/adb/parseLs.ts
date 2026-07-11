/**
 * Tolerant parsing of `adb shell` directory listings (spec §7.2). Android shells
 * vary (toybox vs busybox, with/without link counts), so this is deliberately
 * heuristic and lives here isolated for unit testing against captured output.
 *
 * Two shapes are supported:
 *   - `ls -l <dir>`  → regular-file rows with size + name (preferred: gives size)
 *   - `find <dir> -name '*.rlog' -type f` → one absolute path per line (no size)
 */

export interface LsEntry {
  filename: string
  file_size_bytes: number | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{1,2}:\d{2}(:\d{2})?$/
const INT = /^\d+$/

/** Parse `ls -l` output into regular-file entries (skips dirs, symlinks, `total` header). */
export function parseLsOutput(text: string): LsEntry[] {
  const entries: LsEntry[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('total')) continue
    // Only regular files: `ls -l` marks them with a leading '-'. Directories ('d'),
    // symlinks ('l') and device nodes are skipped.
    if (!/^-/.test(line)) continue

    const tokens = line.split(/\s+/)
    const dateIdx = tokens.findIndex((t) => DATE.test(t))

    if (dateIdx >= 0) {
      const nameStart = TIME.test(tokens[dateIdx + 1] ?? '') ? dateIdx + 2 : dateIdx + 1
      const filename = tokens.slice(nameStart).join(' ')
      const sizeTok = tokens[dateIdx - 1]
      if (filename) {
        entries.push({ filename, file_size_bytes: INT.test(sizeTok ?? '') ? Number(sizeTok) : null })
      }
      continue
    }

    // No recognisable date column — fall back to "name is the last token, size is
    // the last standalone integer before it" (covers stripped-down `ls -l` output).
    const filename = tokens[tokens.length - 1]
    if (!filename) continue
    let size: number | null = null
    for (let i = tokens.length - 2; i >= 0; i--) {
      if (INT.test(tokens[i])) {
        size = Number(tokens[i])
        break
      }
    }
    entries.push({ filename, file_size_bytes: size })
  }
  return entries
}

/** Parse `find … -type f` output into absolute remote paths (whitespace/blank tolerant). */
export function parseFindOutput(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.startsWith('/'))
}

/** basename of a POSIX/Android path. */
export function remoteBasename(path: string): string {
  const i = path.lastIndexOf('/')
  return i >= 0 ? path.slice(i + 1) : path
}
