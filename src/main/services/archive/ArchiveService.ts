import { basename, join } from 'path'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import { LOG_KINDS } from '@shared/constants/fileKinds'
import { makeDefaultMetadata } from '@shared/schema/sessionJson'
import type {
  CreateSessionInput,
  Session,
  SessionMetadata,
  SessionNode
} from '@shared/types/session'
import { INDEX_FILE, NOTES_FILE, RESERVED_NAMES, toFolderName, uniqueChildDir } from './paths'
import { readMetadata, readMetadataOrDefault, writeMetadata, writeNotes } from './SessionStore'

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
    .filter((e) => e.isDirectory())
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
    .filter((e) => e.isDirectory())
    .map((e) => scanNode(join(root, e.name)))
  nodes.sort(compareNodes)
  return nodes
}

function toSession(dir: string): Session {
  const { metadata, hasSessionJson } = readMetadataOrDefault(dir)
  return { path: dir, name: basename(dir), metadata, hasSessionJson }
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
  writeNotes(dir, `# ${input.displayName}\n\n`)
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
  if (!existsSync(join(dir, NOTES_FILE))) writeNotes(dir, `# ${metadata.display_name}\n\n`)
  return { path: dir, name: basename(dir), metadata: written, hasSessionJson: true }
}
