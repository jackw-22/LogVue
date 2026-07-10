# LogVue Agentic Workflows and MCP Investigation

## Status

This document records an early design direction for making LogVue useful in
agentic robot-development workflows. It is an investigation, not yet an
implementation specification.

The intended experience is that a user can tell an agent something natural such
as:

> There is a new log. I made the change.

The agent should then be able to use LogVue to discover the new Control Hub log,
import it, place it in the appropriate session, inspect its embedded build and Git
metadata, and update the session notes. The user should not need to manually import
the file, locate it on disk, and copy its path into a terminal.

## Agreed design direction

### Keep the archive model small

The agent integration should use LogVue's existing concepts:

- Sessions and child sessions organise work.
- Files, including RLOGs, belong directly to a session.
- `session.json` contains authoritative session and file metadata.
- `notes.md` contains the human-readable investigation history.
- The SQLite index remains disposable and rebuildable.

There should not be a separate `run` or `iteration` entity. A distinct line of
investigation can be represented by a child session, for example:

```text
2026-07-10 Workshop
└── Heading PID tuning
    ├── RedOpMode31348211.rlog
    ├── RedOpMode31351982.rlog
    ├── session.json
    └── notes.md
```

The agent creates `Heading PID tuning` once and continues to import related logs
and append observations there. It should not create a child session for every code
change.

### Give agents broad capability parity

The agent should be able to perform essentially all meaningful domain operations
that a user can perform in the UI, including:

- Browse, search, create, and update sessions.
- Create child sessions.
- Read and update notes.
- Discover Control Hub logs.
- Import logs into existing or new sessions.
- Inspect imported files and embedded RLOG metadata.
- Tag and organise sessions.
- Ignore or unignore remote logs.
- Use FTCScout search and synchronisation where appropriate.
- Rebuild or refresh derived data.

Literal UI affordances do not necessarily need MCP equivalents. Native directory
pickers, revealing files in Explorer, and opening files with the operating system
can remain UI-specific operations.

### Treat imported logs as immutable

There is currently no stable application-level log UUID. The effective archive
identity of a file is:

```text
(session_id, filename)
```

`SessionFile` stores `filename` but no file ID. The SQLite `files.id` column is an
internal auto-increment value in a disposable index and must not be treated as a
stable identity. RLOG metadata is already indexed by `(session_id, filename)`.

This composite identity is sufficient if the following invariants are adopted and
enforced:

1. A filename is unique within its session.
2. An imported file is never renamed.
3. An imported file's contents are never modified.
4. An imported file is not moved between sessions.
5. Importing or copying it elsewhere creates a distinct archived file.
6. SQLite row IDs are never exposed as durable file identifiers.

Import currently avoids overwrites by suffixing collisions, for example
`log.rlog`, `log_2.rlog`, and `log_3.rlog`. Filename uniqueness is maintained by
normal import behaviour, but it is not yet formally validated in `session.json` or
constrained by the derived `files` table.

Remote duplicate detection is a separate concern. It currently compares remote
path, original filename, and file size to determine whether a Control Hub file has
already been imported. This remote identity should not be confused with the
permanent archive identity.

## Notes and references

Session notes should remain free-form Markdown. The agent should be able to append
an observation and associate it with a log or Git commit without introducing a
larger data model.

A human-readable note might look like:

```md
## Increased heading kP

[@RedOpMode31348211](logvue://sessions/SESSION_ID/files/RedOpMode31348211.rlog)
was built from [`xyzabcd`](logvue://repositories/robot-code/commits/xyzabcd).

Changed heading `kP` from `0.04` to `0.055`.

The response is faster, but it now overshoots by approximately 7 degrees.
```

LogVue could render these links as compact, clickable mentions. Typing `@Red` in
the notes editor could offer autocomplete for files in the current session. A log
mention could show its recording time, OpMode, branch, commit, dirty state, and
other embedded metadata.

References in notes are navigation and commentary, not authoritative ownership
metadata:

- `session.json` determines which files belong to the session.
- The RLOG determines its embedded build metadata.
- `notes.md` explains what changed and what was observed.

The application may derive an index of note references for search and backlinks,
but critical archive state should never need to be reconstructed from prose.

## Current architecture assessment

### Useful existing seam

`src/shared/types/ipc.ts` already provides a central typed map of request/response
operations. `src/main/ipc/registry.ts` statically requires a handler for each
declared operation. The renderer is sandboxed and reaches privileged functionality
only through the preload bridge.

This is a strong starting point because most agent-relevant capabilities already
have request/response shapes. However, the IPC registry should not itself become
the MCP implementation.

### Recommended application boundary

Electron IPC and MCP should be adapters over one shared application service:

```text
React renderer ── Electron IPC adapter ──┐
                                         ├── LogVueService
Agent host ────── MCP adapter ───────────┘       │
                                                 ├── archive
                                                 ├── ADB / hub source
                                                 ├── index
                                                 ├── watcher
                                                 └── FTCScout
```

The application service should own orchestration such as reindexing after a
mutation, refreshing the log source after settings changes, validating archive
boundaries, and coordinating imports. IPC and MCP handlers should be thin transport
adapters.

An illustrative service surface is:

```ts
interface LogVueService {
  getSession(sessionId: string): Promise<Session>
  searchSessions(query: SessionQuery): Promise<SessionQueryResult>
  createSession(input: CreateSessionCommand): Promise<Session>
  updateSession(input: UpdateSessionCommand): Promise<Session>

  listHubLogs(input?: ListHubLogsQuery): Promise<HubLog[]>
  importLog(input: ImportLogCommand): Promise<ImportResult>

  readNotes(sessionId: string): Promise<NotesDocument>
  writeNotes(input: WriteNotesCommand): Promise<NotesDocument>
  appendNote(input: AppendNoteCommand): Promise<NotesDocument>
}
```

This is only an illustration; the investigation should determine the appropriate
operation granularity and whether the service is synchronous or asynchronous.

### Process ownership requires investigation

The current settings implementation depends on Electron, and the index uses the
ABI-specific `better-sqlite3` native module. Starting an independent Node MCP
process that imports the Electron main-process modules directly would therefore be
awkward and could lead to multiple processes owning the index, watcher, and archive
writes.

The preferred invariant is that one process owns ADB access, the watcher, SQLite,
and archive mutations. Options to investigate include:

1. The Electron main process hosts the service and a local MCP endpoint.
2. A thin stdio MCP bridge communicates with the running Electron application over
   an authenticated local transport.
3. A later headless LogVue service owns the core, with Electron and MCP both acting
   as clients.

The first option may provide the smallest initial vertical slice. The third is the
cleanest long-term separation but requires more restructuring.

## Contract improvements needed for MCP

### Stable session references instead of paths

Current IPC operations commonly accept absolute session paths. A public agent API
should accept stable `session_id` values and have the service resolve them to paths.
Every resolved path must be verified to remain beneath the configured archive
root.

For example:

```ts
interface CreateSessionCommand {
  /** `null` means the archive root. */
  parentSessionId: string | null
  displayName: string
  sessionType: SessionType
}
```

Absolute paths may still appear in UI-specific response data, but they should not
be authority-bearing MCP inputs.

### Runtime schemas

TypeScript types disappear at runtime. MCP input is arbitrary JSON, so every public
operation needs runtime validation. Zod schemas can potentially be shared between
the service, IPC adapter, MCP input schema generation, and tests.

Runtime validation should cover:

- Required and optional fields.
- String lengths and blank values.
- Enum membership.
- Valid timestamps and numbers.
- Archive containment.
- Existing session and file references.
- Immutable fields.

The preload's generic `invoke` function is constrained by TypeScript but does not
perform a runtime channel check. A runtime channel allow-list should also be
considered so the security property remains explicit as the application grows.

### Narrow mutation commands

The current `archive:updateMeta` accepts `Partial<SessionMetadata>`. This is too
broad for an agent-facing operation because it could replace the session's file
array, alter `session_id`, change the schema version, or redirect `notes_file`.

The public update contract should allow only user-editable fields, for example:

```ts
interface UpdateSessionCommand {
  sessionId: string
  displayName?: string
  sessionType?: SessionType
  tags?: string[]
  sessionStart?: string | null
  sessionEnd?: string | null
  event?: EventInfo
  match?: MatchInfo
}
```

File membership should change only through explicit import or future file-management
operations.

### Concurrent note editing

The current notes write replaces the entire file. Once both the UI and an agent can
write notes, a stale full-document write could silently overwrite another edit.

Potential operations are:

```ts
writeNotes({ sessionId, markdown, expectedRevision })

appendNote({
  sessionId,
  heading,
  markdown,
  references,
  mutationId
})
```

`expectedRevision` would detect concurrent full-document edits. `mutationId` would
make appends idempotent if an MCP client retries a tool call. Writes should also be
atomic at the filesystem boundary.

### Structured errors

MCP callers need machine-readable errors rather than transport-specific thrown
messages. Candidate error codes include:

- `INVALID_INPUT`
- `SESSION_NOT_FOUND`
- `FILE_NOT_FOUND`
- `OUTSIDE_ARCHIVE`
- `DEVICE_OFFLINE`
- `LOG_NOT_FOUND`
- `AMBIGUOUS_LOG`
- `DUPLICATE_IMPORT`
- `WRITE_CONFLICT`

Errors should include a human-readable message and, when useful, structured details
such as candidate logs or the location of an existing import.

## Candidate MCP capabilities

The exact names are provisional. The initial MCP interface should prefer small,
composable domain operations over mirroring every IPC channel verbatim.

### Read operations

- `logvue_status`
  - Archive configuration and health.
  - Hub source and connection status.
  - Optional current or active session context.
- `session_search`
  - Reuse the existing structured session query and facets.
- `session_get`
  - Session metadata, child summary, files, and optionally notes.
- `session_tree`
  - Browse the hierarchy when search is insufficient.
- `hub_list_logs`
  - Filter by import state, time, OpMode, or filename.
- `log_get`
  - Resolve `(session_id, filename)` and return embedded metadata.
- `notes_read`
  - Read the current Markdown and revision.

### Mutation operations

- `session_create`
- `session_update`
- `session_add_tags`
- `session_promote_folder`, if bare-folder promotion remains a public concept
- `log_import`
- `log_import_to_new_session`
- `hub_log_ignore`
- `hub_log_unignore`
- `notes_write`
- `notes_append`
- `ftcscout_sync_event`
- `archive_rebuild_index`

Some tools may later be combined into convenience operations, but only after the
primitive operations and ambiguity behaviour are well understood. For example,
`import_latest_log` should not guess when several plausible logs exist; it should
return candidates or a structured ambiguity error.

### Resources

Read-only MCP resources may provide convenient context alongside tools:

```text
logvue://status
logvue://sessions/{session_id}
logvue://sessions/{session_id}/notes
logvue://sessions/{session_id}/files/{filename}
logvue://sessions/{session_id}/files/{filename}/metadata
```

The value of resources versus tools should be tested with the intended agent hosts
rather than decided solely from protocol aesthetics.

## Git and build provenance

LogVue already extracts arbitrary string metadata from the head of RLOG files and
recognises fields such as:

- `GitSHA`
- `GitBranch`
- `GitDirty`
- `BuildDate`
- `OpMode Name`
- `OpMode type`

The current log-level query does not return the indexed file metadata, so an early
agent-facing improvement should provide a detailed imported-log query keyed by
`(session_id, filename)`.

Potential later repository integration could compare an RLOG's recorded build with
a configured robot-code repository:

- Recorded commit versus current `HEAD`.
- Recorded branch versus current branch.
- Whether the recorded commit exists locally.
- Commits between the recorded build and the current branch.
- Whether the recorded build was dirty.

`GitDirty=true` cannot reveal which uncommitted changes were deployed. Capturing a
diff hash or optional patch before deployment could improve reproducibility, but
this should be investigated separately and should not be required for the initial
MCP integration.

## Full RLOG querying

The current RLOG reader extracts metadata from the beginning of a file. It does not
yet expose the full time-series contents to queries.

Finding, importing, organising, and inspecting build provenance can therefore form
a useful first MCP milestone without full signal analysis. Later deterministic
operations might include:

- List channels and their types.
- Query selected channels within a time range.
- Downsample to a bounded number of points.
- Compute basic statistics.
- Find transitions or threshold crossings.
- Compare selected signals across two logs.

Raw complete logs should not be placed directly into an agent's context. Queries
need explicit bounds, aggregation, and output limits. LogVue should provide
deterministic extraction; the agent can provide interpretation.

## Security and operational constraints

- Restrict all archive operations to the configured archive root.
- Restrict Git operations to explicitly configured repositories.
- Do not expose arbitrary filesystem paths as authority-bearing inputs.
- Keep Control Hub operations import-only initially; do not add remote deletion or
  renaming.
- Preserve duplicate detection and require an explicit override for extra copies.
- Make mutations idempotent where retries could otherwise duplicate state.
- Coordinate UI and MCP writes through the same service instance or locking model.
- Keep the index disposable and avoid making MCP-only state authoritative in it.
- Record useful provenance for agent mutations where it remains unobtrusive.

## Suggested investigation sequence

### 1. Define capability parity

Inventory the existing IPC operations and classify each as:

- Domain capability exposed through both IPC and MCP.
- UI-only capability.
- Internal maintenance operation.
- Unsafe or overly broad operation that needs redesign.

The result should make omissions intentional and testable.

### 2. Prototype a runtime-neutral service

Extract a small slice containing:

- Search sessions.
- Get a session by ID.
- Create a child session.
- List hub logs.
- Import one log.
- Read and append notes.

Make the existing IPC handlers delegate to it before adding MCP. This will reveal
which dependencies are still coupled to Electron or global singleton state.

### 3. Prototype read-only MCP

Expose status, session search, session details, hub-log listing, and imported-log
metadata. Confirm that tool results are concise and useful to real agent hosts.

### 4. Add one complete mutation workflow

Implement the first end-to-end experience:

```text
"There is a new log"
  → list unimported hub logs
  → resolve ambiguity
  → find or create the target child session
  → import the log
  → inspect Git metadata
  → append a referenced note
```

### 5. Evaluate process and transport choices

Test whether the Electron-hosted service is sufficient or whether a headless owner
is justified. Include Windows, WSL, ADB coexistence, native-module ABI, shutdown,
and reconnect behaviour in the evaluation.

### 6. Investigate time-series access separately

Do not block the archive and provenance workflow on a complete RLOG query engine.
Define and benchmark bounded channel queries as a later vertical slice.

## Open questions

1. Should LogVue have an explicit active session shared between the UI and agent,
   or should every mutating tool require a target session?
2. How should a top-level session be addressed when `parentSessionId` is null?
3. Should agents be allowed to change archive and hub-source settings, or only read
   them?
4. Should `notes.md` use custom `logvue://` links, relative Markdown links, or an
   `@mention` syntax that is expanded to canonical links?
5. Does a referenced filename include its `.rlog` extension in the visible mention?
6. Should filename uniqueness be enforced in the Zod schema, SQLite schema, or
   both?
7. How should manually copied loose files become tracked files without violating
   immutability?
8. What is the desired behaviour if a user manually renames or moves an imported
   file outside LogVue?
9. Which MCP transport works best with the intended agent hosts and the Electron
   lifecycle?
10. Should mutations record whether they originated from the UI, MCP, or another
    integration?
11. How much repository access should LogVue own instead of leaving Git inspection
    to the coding agent?
12. Which RLOG parser and query primitives are needed for useful robot debugging
    without producing excessive context?

## Initial success criterion

The first implementation should be considered useful when this interaction works
reliably without the user handling filesystem paths:

> The user says there is a new log. The agent discovers it through LogVue, resolves
> any ambiguity, imports it into an existing or newly created child session, reports
> its embedded Git/build metadata, and appends a readable note that references the
> imported log.
