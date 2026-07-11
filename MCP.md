# LogVue MCP integration

While the LogVue desktop application is running, it exposes an MCP Streamable HTTP endpoint at:

```text
http://127.0.0.1:47831/mcp
```

The server is loopback-only and is hosted by Electron's main process. MCP-triggered imports therefore use the same ADB client, archive services, index, and Activity task registry as renderer-triggered imports.

## Codex configuration

Add the server to Codex from a shell that can reach the Windows host loopback interface:

```sh
codex mcp add logvue --url http://127.0.0.1:47831/mcp
```

With WSL2 mirrored networking or localhost forwarding, the loopback URL should work directly. If the WSL environment cannot reach Windows loopback, transport discovery/bridging will be needed before using the MCP endpoint from WSL.

## Tools

- `get_status`: configured archive and ADB status.
- `list_hub_logs`: RLOG files available from the configured Control Hub.
- `import_hub_log`: imports one listed remote log into an existing archive session.
- `write_session_notes`: replaces a session's `notes.md`, reindexes it, and refreshes the renderer.

Reading, navigation, grep, and bulk analysis remain filesystem-native. MCP is intentionally limited to LogVue-owned actions and live Control Hub access.
