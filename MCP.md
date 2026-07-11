# LogVue MCP integration

While the LogVue desktop application is running, it exposes an MCP Streamable HTTP endpoint. Windows-native and WSL mirrored-network clients can use:

```text
http://127.0.0.1:47831/mcp
```

The server is hosted by Electron's main process. MCP-triggered imports therefore use the same ADB client, archive services, index, and Activity task registry as renderer-triggered imports. Non-loopback requests require the per-launch bearer token written to `<archive>/.logvue/mcp.json`.

## Codex configuration

For a configuration that works in both WSL NAT and mirrored networking, have Codex launch the included bridge. Replace the discovery path with the WSL path to your archive:

```sh
codex mcp add logvue -- node /path/to/LogVue/out/main/mcpBridge.js /path/to/archive/.logvue/mcp.json
```

The bridge first tries loopback. If that is unavailable, it discovers the current Windows host from WSL's default route and authenticates using the discovery file. The Codex configuration therefore remains stable when the WSL networking mode or NAT gateway changes.

## Tools

- `get_status`: configured archive and ADB status.
- `list_hub_logs`: RLOG files available from the configured Control Hub.
- `import_hub_log`: imports one listed remote log into an existing archive session.
- `write_session_notes`: replaces a session's `notes.md`, reindexes it, and refreshes the renderer.

Reading, navigation, grep, and bulk analysis remain filesystem-native. MCP is intentionally limited to LogVue-owned actions and live Control Hub access.
