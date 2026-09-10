import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { APP_NAME } from '@shared/constants'
import { describeError, scopedLogger } from '../Logger'
import { authorize, extractBearerToken } from './auth'
import { registerAllTools } from './tools'
import { mainT } from '../app/settings'

const log = scopedLogger('mcp.server')

/** Der Pfad, unter dem der Streamable-HTTP-Transport erreichbar ist. */
export const MCP_PATH = '/mcp'

/** Nur die Loopback-Adresse — der Server ist ausschließlich für die eigene CLI gedacht. */
const HOST = '127.0.0.1'

let httpServer: Server | null = null
let port: number | null = null

/** `http://127.0.0.1:<port>/mcp`, sobald der Server läuft. */
export function getUrl(): string {
  if (port === null) throw new Error(mainT()('main.error.mcpDown'))
  return `http://${HOST}:${port}${MCP_PATH}`
}

export function isRunning(): boolean {
  return port !== null
}

export function start(): Promise<string> {
  if (httpServer) return Promise.resolve(getUrl())

  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      log.error('Anfrage fehlgeschlagen', describeError(error))
      sendJson(response, 500, { error: 'internal_error' })
    })
  })
  httpServer = server

  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      httpServer = null
      port = null
      reject(error)
    }
    server.once('error', onError)
    server.listen(0, HOST, () => {
      server.off('error', onError)
      const address = server.address()
      if (address === null || typeof address === 'string') {
        onError(new Error(mainT()('main.error.mcpNoPort')))
        return
      }
      port = address.port
      log.info('MCP-Server gestartet', { url: getUrl() })
      resolve(getUrl())
    })
  })
}

export function stop(): Promise<void> {
  const server = httpServer
  httpServer = null
  port = null
  if (!server) return Promise.resolve()

  return new Promise((resolve) => {
    server.closeAllConnections()
    server.close(() => {
      log.info('MCP-Server beendet')
      resolve()
    })
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) {
    response.end()
    return
  }
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const path = (request.url ?? '').split('?')[0]
  if (path !== MCP_PATH) {
    sendJson(response, 404, { error: 'not_found' })
    return
  }

  const context = authorize(request.headers.authorization)
  if (!context) {
    // Vor jedem Werkzeug: ohne gültiges Token endet die Anfrage hier.
    log.warn('Anfrage ohne gültiges Token abgewiesen', {
      hadHeader: Boolean(extractBearerToken(request.headers.authorization)),
    })
    response.setHeader('WWW-Authenticate', 'Bearer')
    sendJson(response, 401, { error: 'unauthorized' })
    return
  }

  const token = extractBearerToken(request.headers.authorization)!

  /**
   * Pro Anfrage ein eigener Server samt Transport im zustandslosen Modus: mehrere Agenten
   * laufen gleichzeitig, und so kann keine Antwort im falschen Lauf landen.
   */
  const mcp = new McpServer(
    { name: 'orchestrator', version: '2.0.0', title: APP_NAME },
    { capabilities: { tools: {} } },
  )
  registerAllTools(mcp, { context, token })

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  // Der Transport hält den Server bis zum Ende der Antwort; danach ist er wertlos.
  response.on('close', () => {
    void mcp.close().catch(() => undefined)
  })

  try {
    await mcp.connect(transport)
    await transport.handleRequest(request, response)
  } catch (error) {
    await mcp.close().catch(() => undefined)
    throw error
  }
}
