# MCP integration

## Purpose

LogVue's MCP surface is intentionally action-oriented. Agents already navigate the archive, read `session.json`, patch `notes.md`, grep text, and analyse logs effectively through the filesystem. MCP exists for operations that must go through the running application:

- discover live or folder-backed hub logs;
- create sessions using LogVue's naming and schema rules;
- import logs through LogVue's duplicate detection, Activity task, metadata, and indexing pipeline.

Do not duplicate general filesystem search or file-editing tools in MCP.

## Architecture

The Electron main process hosts a stateless Streamable HTTP MCP server on port `47831`. Each HTTP POST receives a fresh MCP server and transport, as required by the SDK's stateless lifecycle.

Windows-native and mirrored-network WSL clients can use loopback directly. WSL in NAT mode uses the bundled stdio bridge:

```text
Codex in WSL
  -> stdio MCP
  -> out/main/mcpBridge.js
  -> authenticated Streamable HTTP
  -> LogVue Electron main process
```

LogVue permits unauthenticated loopback access and requires a stable random 256-bit bearer token for non-loopback requests. Connection information is stored at the app-level path:

```text
<user-data>/mcp.json
```

The active archive is not part of the bridge configuration. Agents discover it from `get_status`, and all archive tools follow the library currently selected in LogVue.

The bridge tries `127.0.0.1` first. If unavailable, it reads WSL's default route to find the current Windows NAT gateway and authenticates with the discovery token.

## Codex installation

Build and launch LogVue, then confirm `<user-data>/mcp.json` exists. Register the bridge from WSL using the WSL-visible path:

```sh
codex mcp add logvue -- \
  node /path/to/LogVue/out/main/mcpBridge.js \
  /path/to/LogVue/user-data/mcp.json
```

Fully restart Codex after configuration or tool-schema changes. Resuming a conversation is supported:

```sh
codex resume --last
```

Inspect configuration with `codex mcp get logvue` and `codex mcp list`.

## Tool contract

### `get_status`

Returns application settings, MCP endpoint status, and the current ADB/folder-source connection status.

### `list_hub_logs`

Returns newest-first logs from the configured ADB or folder source:

```json
{ "limit": 20 }
```

`limit` defaults to 20 and is restricted to 1–100. Results include `returned` and `total`. Keeping this bounded matters because a development log directory can overwhelm an agent's context.

### `create_session`

Creates a schema-valid session using the same archive service as the UI:

```json
{
  "parentPath": "APOC26",
  "displayName": "Q12 Blue B2",
  "sessionType": "official_match"
}
```

`parentPath` defaults to the archive root and accepts an archive-relative path, Windows absolute path, or WSL `/mnt/<drive>/...` path. Results include the session and `archiveRelativePath`.

### `import_hub_log`

Imports one exact `remote_path` returned by `list_hub_logs`. The remote log is revalidated immediately before import, and the operation uses LogVue's Activity task and index pipeline.

`sessionPath` accepts the same path forms as `create_session`. Set `force` only when deliberately importing another copy after duplicate detection.

## Filesystem responsibilities

Agents should use normal filesystem tools for archive traversal, `session.json`, `notes.md`, grep, bulk analysis, and specialised log inspection. The archive watcher rebuilds the derived index and refreshes the renderer after direct edits.

Agents must not edit LogVue's internal data, including `index.sqlite` and the app-level `mcp.json`.

## Verification

Use the Linux Node installation described in `AGENTS.md`:

```sh
PATH=/home/jack/.local/node/bin:$PATH npm run typecheck
PATH=/home/jack/.local/node/bin:$PATH npm run build
PATH=/home/jack/.local/node/bin:$PATH TZ=UTC npm test
```

The current checkpoint passes the production build, full typecheck, and all 123 tests.

## Troubleshooting

- Missing `mcp.json`: LogVue has not started the MCP-enabled build on this user profile yet.
- WSL `127.0.0.1` fails in NAT mode: use the stdio bridge rather than the direct HTTP URL.
- HTTP 500 during initialization: ensure each stateless POST creates a fresh MCP server and transport.
- Codex retains an old failure: fully exit Codex and resume it so configuration and schemas reload.
- Codex logs are in `~/.codex/logs_2.sqlite`; bridge messages use the `MCP server stderr (node)` prefix.
- Restart both LogVue and Codex after tool-schema changes.

## Further work

- Add an installation flow so users do not construct the bridge command manually.
- Decide whether MCP is enabled by default or controlled by a setting.
- Add protocol-level tests for initialization, tool listing, authentication, and NAT forwarding.
- Test Windows, WSL, relative, and archive-escape path resolution.
- Add a cursor or date boundary if agents need logs older than the newest 100.
- Improve structured error codes for duplicates, missing sessions, and unavailable sources.
- Ensure installer packaging includes the bridge and MCP SDK dependencies.

## Commit history

- `c95544d` — initial action-oriented MCP prototype.
- `b4e8990` — authenticated bridge supporting WSL NAT and mirrored networking.
- Current checkpoint — corrected stateless lifecycle, bounded hub-log results, filesystem-first guidance, flexible paths, and session creation.
