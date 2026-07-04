# LogVue — Architecture

FTC Control Hub RLOG organiser. Desktop app to browse `.rlog` files on a Control Hub
over ADB, import them into a local **folder-based** archive, and annotate them as
sessions (competitions, matches, tuning runs, workshop tests…).

This document is the design contract. It should be read alongside
[`ftc_control_hub_rlog_organiser_spec.md`](./ftc_control_hub_rlog_organiser_spec.md),
which defines *what* to build; this defines *how*.

---

## 1. Stack

| Concern            | Choice                                   | Why |
|--------------------|------------------------------------------|-----|
| Shell              | **Electron**                             | Cross-platform desktop, web UI, direct Node access to `adb`/fs/sqlite |
| UI                 | **React 18 + TypeScript**                | Best-covered by tooling; large ecosystem for tree/table widgets |
| Build              | **electron-vite**                        | One Vite config for main / preload / renderer; fast HMR |
| Renderer state     | **Zustand** (UI state) + **TanStack Query** (main-process calls) | Query gives caching/loading/refetch over IPC for free |
| Local index        | **better-sqlite3**                       | Synchronous, fast, native; index lives in the main process only |
| ADB                | subprocess wrapper over system `adb`     | No native android deps; tolerant of shell differences (spec §7) |
| FTCScout           | GraphQL over `fetch` (`api.ftcscout.org/graphql`) | Optional, online-only, cached to sqlite |
| Packaging          | **electron-builder** (win/mac/linux)     | Standard, code-sign ready later |
| Testing            | **Vitest** (unit) + **Playwright-Electron** (e2e, later) | Vitest shares Vite config |

> The spec suggested Python/PySide6; we deliberately chose Electron/React for the
> web UI and cross-platform packaging. Every spec *concept* still maps 1:1 (below).

---

## 2. Process model

Electron's three contexts, with a hard security boundary:

```
┌──────────────────────────────────────────────────────────────────┐
│ RENDERER  (Chromium, sandboxed, NO node integration)               │
│   React app. Pure UI. Talks to the world only through window.api.  │
│   – Zustand stores, TanStack Query                                 │
│   – SessionTree · HubLogTable · SessionDetails · NotesEditor       │
└───────────────▲──────────────────────────────────────────────────┘
                │  window.api.*  (typed, promise-based)
┌───────────────┴──────────────────────────────────────────────────┐
│ PRELOAD  (contextBridge, contextIsolation: true)                   │
│   Exposes a small, typed, allow-listed API. No raw ipcRenderer,    │
│   no fs, no child_process reach the renderer.                      │
└───────────────▲──────────────────────────────────────────────────┘
                │  ipcMain.handle(channel, …)  ⇄  ipcRenderer.invoke
┌───────────────┴──────────────────────────────────────────────────┐
│ MAIN  (Node.js — trusted)                                          │
│   All privileged work lives here:                                  │
│   – AdbClient (child_process)      – ArchiveService (fs)           │
│   – IndexStore (better-sqlite3)    – FtcScoutClient (fetch)        │
│   – ImportService (orchestration)  – Watcher (chokidar)            │
└──────────────────────────────────────────────────────────────────┘
```

Security posture: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
The renderer can never touch fs/adb directly — it asks main via the allow-listed
bridge. This keeps us safe and makes the IPC surface the single source of truth for
"what the app can do."

---

## 3. Repository layout

```
LogVue/
  package.json
  electron.vite.config.ts
  electron-builder.yml
  tsconfig.json                # references the three below
  ARCHITECTURE.md
  ftc_control_hub_rlog_organiser_spec.md

  src/
    main/                      # Node / trusted
      index.ts                 # app lifecycle, window creation
      ipc/
        registry.ts            # wires every channel → service method
        channels.ts            # channel name constants
      services/
        adb/
          AdbClient.ts         # device detection, ls, pull
          parseLs.ts           # tolerant `ls -l` / `find` parsing
          rlogFilename.ts      # opmode + timestamp parsing
        archive/
          ArchiveService.ts    # scan / create / read / write sessions
          SessionStore.ts      # session.json + notes.md read/write
          discovery.ts         # folders without session.json → sessions
          paths.ts             # archive root, safe folder naming
        index/
          IndexStore.ts        # better-sqlite3 open/migrate/query
          schema.sql           # index tables (rebuildable)
          rebuild.ts           # full rescan → index
        import/
          ImportService.ts     # pull → copy → session.json → index
          identity.ts          # duplicate detection (§14)
        ftcscout/
          FtcScoutClient.ts    # GraphQL queries
          syncEvent.ts         # merge remote matches → local sessions
        watcher/
          Watcher.ts           # chokidar → incremental index updates
      config/
        settings.ts            # archive root, adb path, prefs (electron-store)

    preload/
      index.ts                 # contextBridge.exposeInMainWorld('api', …)

    renderer/
      index.html
      main.tsx
      App.tsx
      api/                     # thin typed wrappers over window.api
      stores/                  # Zustand: mode, selection, filters
      queries/                 # TanStack Query hooks per domain
      components/
        layout/                # Toolbar, StatusBar, split panes
        SessionTree/
        HubLogTable/
        SessionDetails/
        NotesEditor/
        dialogs/               # create-session, import-conflict, annotate
      styles/

    shared/                    # imported by BOTH main and renderer
      types/
        session.ts             # Session, SessionMetadata, SessionFile
        hublog.ts              # HubLog, ImportStatus
        ftcscout.ts
        ipc.ts                 # the IPC contract (request/response types)
      constants/
        sessionTypes.ts        # §4.3
        fileKinds.ts           # §6
      schema/
        sessionJson.ts         # zod schema + schema_version migrations

  tests/
```

`shared/` is the spine: types defined once, used by main (to validate) and
renderer (to render). The IPC contract in `shared/types/ipc.ts` is the seam.

---

## 4. Data model (mirrors spec §4–6)

TypeScript in `shared/types/`, validated at the fs boundary with **zod**
(`shared/schema/sessionJson.ts`) so a hand-edited or older `session.json` never
crashes the app — it migrates or falls back to discovery defaults (spec §4.2).

```ts
type SessionType =
  | 'competition_event' | 'official_match' | 'practice_match' | 'replay'
  | 'workshop_session'  | 'tuning_session' | 'debug_session'
  | 'test_session'      | 'general_session' | 'other';

interface SessionMetadata {
  schema_version: number;          // 1; migrations keyed off this
  session_id: string;              // stable id (uuid or slug)
  session_type: SessionType;
  display_name: string;            // seeded from folder name on discovery
  created_at: string; updated_at: string;
  session_start?: string | null; session_end?: string | null;
  sort_key?: string | null;
  tags: string[];
  notes_file: string;              // 'notes.md'
  files: SessionFile[];
  // optional typed extensions, present only for relevant types:
  event?: EventInfo;               // competition_event  (§5.1)
  match?: MatchInfo;               // official_match      (§5.2)
  session?: GeneralInfo;           // workshop/general    (§5.4)
  teams?: number[];
}

type FileKind =
  | 'auto_log' | 'teleop_log' | 'match_log' | 'practice_log' | 'tuning_log'
  | 'debug_log' | 'crash_log' | 'test_log'
  | 'video' | 'screenshot' | 'advantage_scope_layout' | 'notes' | 'other';

interface SessionFile {
  filename: string; kind: FileKind; source: string; // 'control_hub' | …
  imported_at: string;
  remote_path?: string | null; original_filename?: string | null;
  file_size_bytes?: number | null;
  // future media sync (§17): time_source, offset_seconds …
}

interface HubLog {                 // a remote file on the Control Hub
  remote_path: string; filename: string;
  opmode: string | null; parsed_timestamp: string | null;
  file_size_bytes: number | null;
  import_status: ImportStatus;     // resolved against the index
}

type ImportStatus =
  | { state: 'not_imported' }
  | { state: 'ignored' }
  | { state: 'imported'; sessionPath: string; sessionLabel: string };
```

### Source of truth vs derived

| Thing                         | Lives in                    | Authoritative? |
|-------------------------------|-----------------------------|----------------|
| Session existence & nesting   | **folders on disk**         | ✅ yes |
| Session metadata / files      | **`session.json`**          | ✅ yes |
| Human notes                   | **`notes.md`**              | ✅ yes |
| Fast browse/filter/search     | `index.sqlite`              | ❌ rebuildable |
| Ignored-remote-log markers    | `index.sqlite` (spec §15)   | ❌ cache |
| FTCScout event/match cache    | `index.sqlite`              | ❌ cache |

**Rule:** the index is disposable. Delete `index.sqlite`, relaunch, and a full
rescan (`index/rebuild.ts`) reconstructs everything (spec §13). This is enforced
by never writing app-critical state *only* to sqlite.

---

## 5. IPC contract (`shared/types/ipc.ts`)

One typed map of `channel → (request) => response`. `preload` exposes exactly
these; `main/ipc/registry.ts` implements exactly these; the renderer's
`api/` wraps them. Adding a capability = adding one entry here.

```ts
interface Api {
  // ── settings / archive root ──────────────────────────────
  'settings:get':            () => AppSettings;
  'settings:pickArchiveRoot':() => string | null;      // native dir dialog
  'settings:setArchiveRoot': (path: string) => AppSettings;

  // ── ADB ──────────────────────────────────────────────────
  'adb:status':      () => { connected: boolean; device?: string };
  'adb:listHubLogs': () => HubLog[];                    // ls + parse + status

  // ── archive / sessions ───────────────────────────────────
  'archive:tree':        () => SessionNode[];           // for SessionTree
  'archive:getSession':  (path: string) => Session;
  'archive:createSession':(input: CreateSessionInput) => Session;
  'archive:updateMeta':  (path: string, patch: Partial<SessionMetadata>) => Session;
  'archive:readNotes':   (path: string) => string;
  'archive:writeNotes':  (path: string, md: string) => void;
  'archive:discoverBare':() => BareFolder[];            // folders w/o session.json
  'archive:rebuildIndex':() => { sessions: number; files: number };

  // ── import ───────────────────────────────────────────────
  'import:toSession':    (req: ImportRequest) => ImportResult;   // append, not replace
  'import:resolveConflict':(req: ConflictResolution) => ImportResult; // §14
  'hublog:ignore':       (remote_path: string, ignored: boolean) => void;

  // ── FTCScout (online only) ───────────────────────────────
  'ftcscout:searchEvents':(q: { season: number; text: string }) => EventHit[];
  'ftcscout:syncEvent':   (req: SyncRequest) => SyncResult;   // merge, preserve local

  // ── events pushed main → renderer (not request/response) ──
  // 'adb:changed', 'index:changed', 'watcher:sessionChanged'
}
```

Push events (device plugged/unplugged, watcher-detected folder change) go over a
separate `main → renderer` emitter so the UI reacts live without polling.

---

## 6. Key data flows

### 6.1 Import a hub log (the core action, spec §7.4 / §9.3)

```
renderer: user clicks "Import latest" on Q4 Blue B2
  → api.import.toSession({ remote_path, sessionPath, kind })
main ImportService:
  1. identity check (§14): remote_path+filename+size vs index
        └─ if match → return { conflict } → renderer shows dialog (Cancel /
           Import copy / Link existing / Reassign)
  2. adb pull <remote_path> → <sessionPath>/<original_filename>   (append)
  3. SessionStore: add SessionFile to session.json, bump updated_at
  4. IndexStore: upsert file row + import-status
  5. return ImportResult → Query invalidates 'archive:getSession' + 'adb:listHubLogs'
renderer: hub log row flips to "Imported → APOC26 / Q4 Blue B2"
```

Never renames/deletes the remote file (spec §7.4, §22). Import **appends**.

### 6.2 Cold start / open archive (spec §13)

```
app boot → settings.archiveRoot
  → if index.sqlite missing OR schema out of date → rebuild.ts scans every folder,
     parses session.json (zod; discovery defaults for bare folders) → populates index
  → Watcher (chokidar) starts on archiveRoot for incremental updates
  → renderer requests archive:tree (served from index, fast)
```

### 6.3 FTCScout sync (spec §8.3 — merge, never clobber)

**FTCScout's job is to pre-create the empty match sessions with correct metadata,
so that at the event logs drop straight into ready-made folders.** It is a scaffold
generator, not a data source — no logs come from FTCScout, only structure.

```
online (before event): user syncs APOC26 for team 12345
  → FtcScoutClient GraphQL: event + team's match schedule
  → syncEvent.ts merges into local competition session:
       • CREATE a child folder + session.json per official match the team plays,
         pre-filled: display_name (e.g. "Q4 Blue B2"), match.{label,type,number,
         alliance,station}, team_number, tags — but files: [] (empty, awaiting import)
       • on re-sync: update FTCScout-owned match fields in place
       • PRESERVE notes.md, tags, imported files, custom child sessions
  → cache raw response in index for offline reuse

at event (offline): Import logs into those pre-made match folders (flow 6.1).
```

The merge writes only FTCScout-owned fields (`match.*`, `event.*`, `last_synced`);
user-owned fields (`tags`, `files`, notes, custom children) are untouched. This is
invariant #5 and gets an explicit unit test. The whole point is that a synced-but-
empty `Q4_Blue_B2/` is already a valid, importable session before a single log exists.

---

## 7. ADB strategy (spec §7)

- Wrap **system `adb`** (from `PATH`) via `child_process`. No bundled binary and no
  configurable path — if `adb` isn't on `PATH`, show a friendly error + install hint.
- **Coexist with an existing adb server; never own it.** `adb` uses a single shared
  host daemon (the adb server) per machine. The FTC IDE / Android Studio very likely
  already started it and may have the device open. Therefore:
    - **Never** run `adb kill-server` or `adb start-server` — that would yank the
      device out from under the IDE. We attach to whatever server is already running
      (a plain `adb` command auto-starts one only if none exists).
    - Our operations are read-only-ish and concurrency-safe: `adb devices`,
      `adb shell ls/find`, `adb pull`. Multiple clients sharing one server is fine.
    - Be resilient to transient "device busy"/offline states from concurrent IDE
      access: surface them and let the user retry, don't crash or auto-restart adb.
- Device detection: parse `adb devices`; poll on an interval **and** offer manual
  refresh; emit `adb:changed` on transitions.
- Discovery: try `find /sdcard/FIRST/PsiKit -name "*.rlog" -type f`; **fall back** to
  `ls -l` parsing when `find` is unavailable (Android shells vary — spec §7.2).
  All parsing isolated in `parseLs.ts` + `rlogFilename.ts` so it's unit-testable
  against captured real-device output.
- Assume ADB (Control Hub Wi-Fi) and internet may be mutually exclusive (spec §8.4):
  FTCScout features degrade gracefully to cached data; nothing blocks on network.

---

## 8. Index schema (rebuildable — `index/schema.sql`)

```sql
sessions(session_id PK, path, session_type, display_name, event_code,
         team_number, alliance, session_start, sort_key, updated_at);
files(id PK, session_id FK, filename, kind, remote_path, original_filename,
      file_size_bytes, imported_at);
ignored_hublogs(remote_path PK, filename, file_size_bytes, ignored_at);
ftcscout_cache(event_code, season, payload_json, last_synced);
```

Everything here is derivable from disk. Filters (spec §12) become indexed queries
(`session_type`, `event_code`, `alliance`, tag join, "has file kind", "missing
teleop"). Search examples in §12.2 are all expressible over these tables.

---

## 9. MVP → phased build order

Tracks spec §18 (MVP) then §19 (post-MVP). Each phase is independently runnable.

| Phase | Deliverable | Spec |
|------:|-------------|------|
| **0** | Scaffold: electron-vite boots empty window; IPC ping; shared types; CI lint/typecheck | — |
| **1** | Archive core: pick root, scan, session.json read/write, discovery, tree UI, sqlite index + rebuild | §3,4,13 |
| **2** | ADB read-only: device status, list hub logs, filename parsing, HubLogTable with import-status | §7.1–7.3,10.1 |
| **3** | Import: pull→copy→append→index, duplicate detection, ignored logs, general/date workflow | §7.4,9.3,10,14,15 |
| **4** | Competition workflow (manual): nested sessions, match rows, notes editor, filters | §9,11,12,16 |
| **5** | FTCScout: event search, sync/merge, offline cache | §8,9.1 |
| **6+**| Drag-drop, AdvantageScope "open log", video/media, zip export, validate/repair | §17,19 |

Phases 0–4 = a genuinely useful offline tool with no external API dependency —
matching the spec's "get the local archive model working first, add FTCScout after."

---

## 10. Open questions → decided defaults (spec §22)

Adopting the spec's recommended defaults, encoded as constants/behaviour:

- Ordering by `sort_key` (falls back to `session_start`, then folder mtime). **No**
  numeric folder prefixes.
- Keep original `.rlog` filenames on import.
- Ignored-log markers live in the index only.
- MVP optimises for one selected team; multi-team is a later view concern.
- FTCScout code and local display code are separate fields (`event.ftcscout_code`
  vs `event.display_code`).
- Files are physically copied into the session folder (no external references in MVP).
- Import-only: never delete/rename on the Control Hub.

Anything here can be revisited, but the code assumes these until changed.

### 10.1 Container folders vs sessions (design note — not yet built)

Bare folders (no `session.json`) currently render with an **"unrecognised"** badge,
which wrongly implies they're an incomplete state needing promotion. But some folders
— year groupings like `2026/`, or organisational buckets — are legitimately *just
folders*, never sessions. UX feedback: don't treat these as errors.

Plan: a bare folder is a neutral **container** by default, and the tree offers two
explicit actions instead of nagging:
- **Recognise as session** → writes `session.json` (current `promoteFolder`).
- **Keep as folder** → marks it a container so it stops being offered as a session
  and renders as a plain group (no session chrome, excluded from session filters/counts).

Open question — where the container marker lives, weighed against invariant #6
(portability):
- `session_type: 'container'` sentinel in a minimal `session.json` → travels with a
  copied archive, visible on disk. *(Leaning this way.)*
- Index/settings-only flag → keeps plain folders truly plain, but the intent doesn't
  survive a copy and must be rebuildable/re-guessed.

Heuristic default worth considering: a folder with only subfolders and no loose files
is almost certainly a container, so it could default to container presentation without
any marker, and only prompt "Recognise as session?" once a log lands in it. Revisit
when building the tree's right-click actions (≈ Phase 4).
