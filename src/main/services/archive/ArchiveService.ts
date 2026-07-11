import { basename, isAbsolute, join, relative, resolve, sep } from 'path'
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'fs'
import { LOG_KINDS } from '@shared/constants/fileKinds'
import { makeDefaultMetadata } from '@shared/schema/sessionJson'
import type {
  CreateSessionInput,
  DeleteSessionSummary,
  FolderFile,
  Session,
  SessionMetadata,
  SessionNode
} from '@shared/types/session'
import {
  INDEX_FILE,
  INTERNAL_DIR,
  NOTES_FILE,
  RESERVED_NAMES,
  SESSION_JSON,
  toFolderName,
  uniqueChildDir
} from './paths'
import { guessFileKind } from '../import/fileKind'
import { extractRlogMetadata } from '../rlog/rlogMetadata'
import { readMetadata, readMetadataOrDefault, writeMetadata } from './SessionStore'

/** Count non-plumbing files in a folder, and how many look like logs. */
function countFiles(dir: string): { fileCount: number; logCount: number } {
  let fileCount = 0
  let logCount = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const name = entry.name
    if (RESERVED_NAMES.has(name) || name === NOTES_FILE || name === INDEX_FILE) continue
    fileCount += 1
    if (name.toLowerCase().endsWith('.rlog')) logCount += 1
  }
  return { fileCount, logCount }
}

/** Build a tree node for a single folder and recurse into its subfolders. */
function scanNode(dir: string): SessionNode {
  const { metadata, hasSessionJson } = readMetadataOrDefault(dir)
  const { fileCount, logCount } = countFiles(dir)

  // Prefer the log-kind count from metadata when it's been curated; otherwise
  // fall back to the on-disk .rlog count so bare folders still show a badge.
  const metaLogCount = metadata.files.filter((f) => LOG_KINDS.has(f.kind)).length
  const children = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !RESERVED_NAMES.has(e.name))
    .map((e) => scanNode(join(dir, e.name)))

  children.sort(compareNodes)

  return {
    path: dir,
    name: basename(dir),
    displayName: metadata.display_name,
    sessionType: metadata.session_type,
    hasSessionJson,
    fileCount,
    logCount: hasSessionJson && metaLogCount > 0 ? metaLogCount : logCount,
    tags: metadata.tags,
    sortKey: metadata.sort_key ?? metadata.session_start ?? null,
    match: metadata.match ?? null,
    children
  }
}

/** Sort siblings by sort key (missing keys last), then display name. */
function compareNodes(a: SessionNode, b: SessionNode): number {
  if (a.sortKey && b.sortKey && a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1
  if (a.sortKey && !b.sortKey) return -1
  if (!a.sortKey && b.sortKey) return 1
  return a.displayName.localeCompare(b.displayName)
}

/** The session tree beneath the archive root (top-level folders as nodes). */
export function scanTree(root: string): SessionNode[] {
  if (!root || !existsSync(root)) return []
  const nodes = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !RESERVED_NAMES.has(e.name))
    .map((e) => scanNode(join(root, e.name)))
  nodes.sort(compareNodes)
  return nodes
}

function toSession(dir: string): Session {
  const { metadata, hasSessionJson } = readMetadataOrDefault(dir)
  return { path: dir, name: basename(dir), metadata, hasSessionJson }
}

/**
 * The files physically present directly inside `dir` (not recursing into subfolders,
 * skipping archive plumbing). Kind comes from `session.json` for tracked files, else is
 * guessed from the name — so you can see the logs in a folder without importing them first.
 */
export function listFolderFiles(dir: string): FolderFile[] {
  if (!existsSync(dir)) return []
  const { metadata } = readMetadataOrDefault(dir)
  const trackedKind = new Map(metadata.files.map((f) => [f.filename, f.kind]))

  const out: FolderFile[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const name = entry.name
    if (RESERVED_NAMES.has(name) || name === NOTES_FILE || name === INDEX_FILE) continue
    let sizeBytes: number | null = null
    let modifiedAt: string | null = null
    try {
      const stats = statSync(join(dir, name))
      sizeBytes = stats.size
      modifiedAt = Number.isFinite(stats.mtimeMs) ? stats.mtime.toISOString() : null
    } catch {
      sizeBytes = null
      modifiedAt = null
    }
    const rlogMeta = name.toLowerCase().endsWith('.rlog')
      ? extractRlogMetadata(join(dir, name))
      : null
    out.push({
      filename: name,
      kind: trackedKind.get(name) ?? guessFileKind(name),
      sizeBytes,
      modifiedAt,
      tracked: trackedKind.has(name),
      metadata: rlogMeta && Object.keys(rlogMeta).length > 0 ? rlogMeta : null
    })
  }
  out.sort((a, b) => a.filename.localeCompare(b.filename))
  return out
}

export function getSession(dir: string): Session {
  return toSession(dir)
}

/** Create a new session folder + `session.json` under `parentPath`. */
export function createSession(input: CreateSessionInput): Session {
  const now = new Date().toISOString()
  const dir = uniqueChildDir(input.parentPath, toFolderName(input.displayName))
  mkdirSync(dir, { recursive: true })

  const metadata: SessionMetadata = {
    ...makeDefaultMetadata(input.displayName, now),
    session_type: input.sessionType,
    display_name: input.displayName,
    session_start: now,
    sort_key: now
  }
  const written = writeMetadata(dir, metadata)
  return { path: dir, name: basename(dir), metadata: written, hasSessionJson: true }
}

/** Merge a partial patch into a session's metadata and persist it. */
export function updateMeta(dir: string, patch: Partial<SessionMetadata>): Session {
  const { metadata } = readMetadataOrDefault(dir)
  const merged: SessionMetadata = { ...metadata, ...patch }
  const written = writeMetadata(dir, merged)
  return { path: dir, name: basename(dir), metadata: written, hasSessionJson: true }
}

/** Write discovery-default metadata for a bare folder, promoting it to a session (spec §4.2). */
export function promoteFolder(dir: string): Session {
  const existing = readMetadata(dir)
  const metadata = existing ?? makeDefaultMetadata(basename(dir))
  const written = writeMetadata(dir, metadata)
  return { path: dir, name: basename(dir), metadata: written, hasSessionJson: true }
}

/** True when `candidate` is a strict descendant of `root`. */
function isStrictDescendant(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * Resolve and validate a session folder before a destructive operation. Symlinks
 * are rejected so a path that looks like it is in the archive cannot target data
 * elsewhere on disk. The archive root itself is never deletable.
 */
function deletableSessionPath(root: string | null | undefined, dir: string): string {
  if (!root || !existsSync(root)) throw new Error('No valid archive root is configured')

  const requested = resolve(dir)
  const requestedStat = lstatSync(requested)
  if (!requestedStat.isDirectory() || requestedStat.isSymbolicLink()) {
    throw new Error('The selected session is not a deletable folder')
  }

  const realRoot = realpathSync(resolve(root))
  const realTarget = realpathSync(requested)
  if (!isStrictDescendant(realRoot, realTarget)) {
    throw new Error('Refusing to delete a folder outside the archive root')
  }
  return realTarget
}

function countDeleteContents(dir: string): { fileCount: number; childFolderCount: number } {
  let fileCount = 0
  let childFolderCount = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name)
    if (entry.name === INTERNAL_DIR) continue
    if (entry.isDirectory()) {
      childFolderCount += 1
      const child = countDeleteContents(entryPath)
      fileCount += child.fileCount
      childFolderCount += child.childFolderCount
    } else if (entry.name !== SESSION_JSON && entry.name !== INDEX_FILE) {
      // notes.md is intentionally counted: deleting investigation notes is data loss
      // even when the session contains no imported logs. Symlinks and other unusual
      // directory entries count too, but are never followed during inspection.
      fileCount += 1
    }
  }
  return { fileCount, childFolderCount }
}

/** Inspect the complete recursive impact before asking the user for confirmation. */
export function deleteSessionSummary(
  root: string | null | undefined,
  dir: string
): DeleteSessionSummary {
  const target = deletableSessionPath(root, dir)
  const { metadata } = readMetadataOrDefault(target)
  return {
    path: target,
    displayName: metadata.display_name,
    ...countDeleteContents(target)
  }
}

/** Permanently remove one session folder and all of its contents. */
export function deleteSession(
  root: string | null | undefined,
  dir: string
): DeleteSessionSummary {
  const summary = deleteSessionSummary(root, dir)
  rmSync(summary.path, { recursive: true })
  return summary
}
