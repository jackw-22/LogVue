import { useState } from 'react'
import { formatRelative } from '../lib/time'
import { useMcpStatus, useMcpToken } from '../api/hooks'

interface Props {
  archiveRoot: string | null
  onClose: () => void
}

function toWslPath(path: string): string {
  const windows = /^([a-zA-Z]):[\\/](.*)$/.exec(path)
  return windows ? `/mnt/${windows[1].toLowerCase()}/${windows[2].replace(/\\/g, '/')}` : path
}

export default function McpSetupDialog({ archiveRoot, onClose }: Props): JSX.Element {
  const { data: status } = useMcpStatus()
  const token = useMcpToken()
  const [copied, setCopied] = useState<string | null>(null)
  const available = !!status?.running && !!status.discoveryReady
  const discoveryPath = status?.discoveryPath ?? '<LogVue user-data>/mcp.json'
  const wslDiscoveryPath = status ? toWslPath(status.discoveryPath) : discoveryPath
  const setupCommand = `codex mcp add logvue -- node /path/to/LogVue/out/main/mcpBridge.js ${wslDiscoveryPath}`

  async function copyText(label: string, value: string): Promise<void> {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(null), 1600)
  }

  async function copyToken(): Promise<void> {
    const value = await token.mutateAsync()
    await copyText('token', value)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal mcp-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-setup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="mcp-setup-title">MCP setup</h2>

        <div className={`mcp-setup-state ${available ? 'available' : 'unavailable'}`}>
          <span className="dot" />
          <span>
            {available
              ? `Available${status?.lastRequestAt ? ` · last request ${formatRelative(status.lastRequestAt)}` : ''}`
              : status?.running
                ? 'Running, but discovery is not ready'
                : 'Not available'}
          </span>
        </div>

        <p className="mcp-setup-intro">
          Configure the MCP bridge once for this LogVue installation. It follows the library selected in LogVue,
          so changing the library does not require changing the MCP configuration.
        </p>

        <section className="settings-section vertical">
          <h3>1. Start LogVue</h3>
          <span className="muted small">The bridge reads this stable app-level discovery file:</span>
          <code className="settings-path" title={discoveryPath}>
            {discoveryPath}
          </code>
          <span className="muted small">Active library:</span>
          <code className="settings-path" title={archiveRoot ?? ''}>
            {archiveRoot ?? 'No library selected'}
          </code>
        </section>

        <section className="settings-section vertical">
          <h3>2. Register the bridge with Codex</h3>
          <span className="muted small">Run this once from WSL, replacing the LogVue source path if needed:</span>
          <code className="mcp-command">{setupCommand}</code>
          <button
            type="button"
            className="ghost sm mcp-copy-button"
            onClick={() => void copyText('command', setupCommand)}
          >
            {copied === 'command' ? 'Copied' : 'Copy setup command'}
          </button>
        </section>

        <section className="settings-section vertical">
          <h3>3. Token</h3>
          <span className="muted small">
            The token is a stable random credential stored in the discovery file. Copy it only when configuring a
            direct non-loopback MCP client; the bridge reads it automatically.
          </span>
          <button
            type="button"
            className="ghost sm mcp-copy-button"
            disabled={!status?.running || token.isPending}
            onClick={() => void copyToken()}
          >
            {token.isPending ? 'Reading…' : copied === 'token' ? 'Copied' : 'Copy token'}
          </button>
        </section>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
