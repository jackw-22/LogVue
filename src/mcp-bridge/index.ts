import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

const Discovery = z.object({
  version: z.literal(1),
  port: z.number().int().min(1).max(65535),
  path: z.string().startsWith('/'),
  token: z.string().min(32)
})

async function main(): Promise<void> {
  // LogVue installs this bridge beside mcp.json. Retain the optional argument
  // for compatibility with configurations created by the prototype.
  const discoveryPath = process.argv[2]
    ? resolve(process.argv[2])
    : join(dirname(resolve(process.argv[1])), 'mcp.json')
  if (!existsSync(discoveryPath)) {
    throw new Error(`LogVue MCP connection details were not found at ${discoveryPath}. Start LogVue and try again.`)
  }
  const discovery = Discovery.parse(JSON.parse(readFileSync(discoveryPath, 'utf8')))
  const host = await findLogVueHost(discovery.port)
  const url = new URL(`http://${host}:${discovery.port}${discovery.path}`)

  const stdio = new StdioServerTransport()
  const http = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${discovery.token}` } }
  })

  stdio.onmessage = (message) => void http.send(message).catch(fatal)
  http.onmessage = (message) => {
    setNegotiatedProtocolVersion(http, message)
    void stdio.send(message).catch(fatal)
  }
  stdio.onerror = fatal
  http.onerror = fatal
  stdio.onclose = () => void http.close()
  http.onclose = () => void stdio.close()

  await http.start()
  await stdio.start()
  console.error(`LogVue MCP bridge connected to ${url.href}`)
}

async function findLogVueHost(port: number): Promise<string> {
  if (await portIsOpen('127.0.0.1', port)) return '127.0.0.1'

  const windowsHost = windowsHostFromDefaultRoute()
  if (await portIsOpen(windowsHost, port)) return windowsHost

  throw new Error('LogVue is not running or its MCP endpoint is unavailable; start LogVue and try again')
}

function setNegotiatedProtocolVersion(transport: StreamableHTTPClientTransport, message: JSONRPCMessage): void {
  if (!('result' in message) || !message.result || typeof message.result !== 'object') return
  const version = (message.result as { protocolVersion?: unknown }).protocolVersion
  if (typeof version === 'string') transport.setProtocolVersion(version)
}

function windowsHostFromDefaultRoute(): string {
  if (!isWsl()) throw new Error('LogVue is not reachable on loopback; start LogVue and try again')
  const output = execFileSync('ip', ['route', 'show', 'default'], { encoding: 'utf8' })
  const gateway = /\bvia\s+(\S+)/.exec(output)?.[1]
  if (!gateway) throw new Error('Could not discover the Windows host from the WSL default route')
  return gateway
}

function isWsl(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true
  try {
    return /microsoft/i.test(readFileSync('/proc/sys/kernel/osrelease', 'utf8'))
  } catch {
    return false
  }
}

function portIsOpen(host: string, port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ host, port })
    const finish = (open: boolean) => {
      socket.destroy()
      done(open)
    }
    socket.setTimeout(350, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

function fatal(error: unknown): void {
  console.error('LogVue MCP bridge error:', error)
  process.exitCode = 1
}

void main().catch((error) => {
  fatal(error)
  process.exit(1)
})
