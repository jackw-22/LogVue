import { createServer, type Server as HttpServer } from 'node:http'
import { relative, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { getSettings } from '../config/settings'
import { listHubLogs } from '../services/adb/hublogs'
import { getAdbClient } from '../services/adb/runtime'
import { readMetadata, writeNotes } from '../services/archive/SessionStore'
import { runSingleImportTask } from '../services/import/importTask'
import { reindexSession } from '../services/index/indexService'
import { notifyArchiveChanged } from '../services/watcher/Watcher'

export const MCP_HOST = '127.0.0.1'
export const MCP_PORT = 47831
export const MCP_PATH = '/mcp'

let httpServer: HttpServer | null = null
let mcpServer: McpServer | null = null
let transport: StreamableHTTPServerTransport | null = null

function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>
  }
}

function archiveSessionPath(input: string): { root: string; sessionPath: string } {
  const configuredRoot = getSettings().archiveRoot
  if (!configuredRoot) throw new Error('No LogVue archive root is configured')
  const root = resolve(configuredRoot)
  const sessionPath = resolve(input)
  const fromRoot = relative(root, sessionPath)
  if (!fromRoot || fromRoot.startsWith('..') || resolve(root, fromRoot) !== sessionPath) {
    throw new Error('sessionPath must identify a session below the configured archive root')
  }
  if (!readMetadata(sessionPath)) throw new Error(`No session.json found at ${sessionPath}`)
  return { root, sessionPath }
}

function createLogVueMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'logvue', version: '0.1.0' },
    {
      instructions:
        'Use these tools for LogVue mutations and Control Hub access. Read and search archive files directly when filesystem access is available.'
    }
  )

  server.registerTool(
    'get_status',
    {
      title: 'Get LogVue status',
      description: 'Return the configured archive and current ADB connection status.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => result({ settings: getSettings(), adb: await getAdbClient().getStatus() })
  )

  server.registerTool(
    'list_hub_logs',
    {
      title: 'List Control Hub logs',
      description: 'List RLOG files currently available from the configured Control Hub.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => {
      const root = getSettings().archiveRoot
      return result({ logs: await listHubLogs(getAdbClient(), root) })
    }
  )

  server.registerTool(
    'import_hub_log',
    {
      title: 'Import a Control Hub log',
      description:
        'Pull one available Control Hub RLOG into an existing session. The import appears in LogVue Activity and updates the index.',
      inputSchema: z.object({
        remotePath: z.string().min(1).describe('Exact remote_path returned by list_hub_logs'),
        sessionPath: z.string().min(1).describe('Absolute path to an existing archive session'),
        force: z.boolean().optional().describe('Import another copy when LogVue detects a duplicate')
      })
    },
    async ({ remotePath, sessionPath: inputPath, force }) => {
      const { root, sessionPath } = archiveSessionPath(inputPath)
      const remote = (await listHubLogs(getAdbClient(), root)).find((log) => log.remote_path === remotePath)
      if (!remote) throw new Error(`Control Hub log is no longer available: ${remotePath}`)
      const imported = await runSingleImportTask(getAdbClient(), root, {
        remotePath: remote.remote_path,
        filename: remote.filename,
        fileSize: remote.file_size_bytes,
        recordedAt: remote.parsed_timestamp,
        sessionPath,
        force
      })
      return result({ result: imported })
    }
  )

  server.registerTool(
    'write_session_notes',
    {
      title: 'Write session notes',
      description:
        'Replace notes.md for an existing session and immediately synchronize the LogVue index and renderer.',
      inputSchema: z.object({
        sessionPath: z.string().min(1).describe('Absolute path to an existing archive session'),
        markdown: z.string().describe('Complete replacement Markdown for notes.md')
      })
    },
    async ({ sessionPath: inputPath, markdown }) => {
      const { root, sessionPath } = archiveSessionPath(inputPath)
      writeNotes(sessionPath, markdown)
      reindexSession(root, sessionPath)
      notifyArchiveChanged(root, [sessionPath])
      return result({ sessionPath, bytesWritten: Buffer.byteLength(markdown, 'utf8') })
    }
  )

  return server
}

export async function startMcpServer(): Promise<void> {
  if (httpServer) return
  mcpServer = createLogVueMcpServer()
  transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await mcpServer.connect(transport)

  httpServer = createServer((req, res) => {
    if (req.url !== MCP_PATH) {
      res.writeHead(404).end()
      return
    }
    if (!isLocalRequest(req.headers.host, req.headers.origin)) {
      res.writeHead(403).end()
      return
    }
    void transport?.handleRequest(req, res).catch((error: unknown) => {
      console.error('LogVue MCP request failed:', error)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })

  await new Promise<void>((resolveReady, reject) => {
    httpServer?.once('error', reject)
    httpServer?.listen(MCP_PORT, MCP_HOST, () => resolveReady())
  })
  console.info(`LogVue MCP server listening at http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}`)
}

function isLocalRequest(hostHeader: string | undefined, originHeader: string | undefined): boolean {
  const allowed = new Set(['127.0.0.1', 'localhost', '[::1]'])
  try {
    const host = new URL(`http://${hostHeader ?? ''}`).hostname
    if (!allowed.has(host)) return false
    return !originHeader || allowed.has(new URL(originHeader).hostname)
  } catch {
    return false
  }
}

export async function stopMcpServer(): Promise<void> {
  const currentHttp = httpServer
  httpServer = null
  await new Promise<void>((resolveClosed) => {
    if (!currentHttp) return resolveClosed()
    currentHttp.close(() => resolveClosed())
  })
  await mcpServer?.close()
  mcpServer = null
  transport = null
}
