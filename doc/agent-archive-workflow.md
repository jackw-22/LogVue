# Agent workflow for LogVue archives

Use the filesystem as the primary archive interface and MCP only for LogVue-owned actions.

## Reading and analysis

1. Call `get_status` to discover the configured archive and source state.
2. Navigate archive folders normally.
3. Read `session.json` for structured metadata and hierarchy context.
4. Read and search `notes.md` with normal filesystem tools.
5. Use grep and suitable log-analysis tools directly against archived logs.

Do not edit `.logvue`; it contains derived indexes and live MCP discovery data.

## Importing a new log

1. Call `list_hub_logs` with a small limit. Increase it only when the desired log is older.
2. Identify the destination from the archive hierarchy and relevant `session.json` files.
3. If no suitable session exists, call `create_session` with the correct parent, name, and type.
4. Call `import_hub_log` with the exact returned `remote_path` and destination session.
5. Do not set `force` unless another copy is explicitly wanted after a duplicate result.

When the destination is ambiguous, ask the user instead of guessing.

## Notes and metadata

Edit `notes.md` with normal patch-based filesystem tools so unrelated content is preserved. Read the current file before editing it. LogVue's watcher synchronizes changes into the UI.

Inspect structured metadata through `session.json`. Preserve unknown fields and the existing schema shape when editing it. Prefer `create_session` over manually constructing a session folder and JSON document.

## Path forms

`create_session.parentPath` and `import_hub_log.sessionPath` accept:

- archive-relative paths such as `APOC26/Q12_Blue_B2`;
- Windows paths such as `C:\\Users\\...\\Q12_Blue_B2`;
- WSL paths such as `/mnt/c/Users/.../Q12_Blue_B2`.

Archive-relative paths are the most portable choice.
