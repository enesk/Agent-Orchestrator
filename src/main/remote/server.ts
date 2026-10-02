import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type { IpcEventName } from '@shared/ipc-contract'
import type { RemoteStatus } from '@shared/types'
import { getAttachmentsRoot } from '../app/attachments'
import { getSettings, mainT } from '../app/settings'
import { getAttachment } from '../db/repositories/messages'
import { describeError, scopedLogger } from '../Logger'
import { emitEvent, observeEvents } from '../ipc/events'
import { buildContractDescription } from './contract'
import { createRequestHandler, sendJson, type HttpDeps } from './http'
import { eventMessage, handleClientMessage, helloMessage } from './protocol'
import { acceptUpgrade, type WebSocketConnection } from './websocket'

const log = scopedLogger('remote')

/** Der Pfad, unter dem Aufrufe und Ereignisse laufen. */
const WS_PATH = '/ws'

/** Lebenszeichen alle 25 Sekunden, wie im Drahtprotokoll beschrieben. */
const PING_INTERVAL_MS = 25_000

/**
 * Lauschadresse: **alle** Netzwerkadressen, damit das Telefon im WLAN herankommt. Das ist die
 * ausdrückliche Entscheidung des Nutzers; eine Authentifizierung gibt es in dieser Phase
 * bewusst nicht. Wer die Adresse erreicht, darf alles.
 */
const HOST = '0.0.0.0'

let httpServer: Server | null = null
let activePort: number | null = null
let lastError: string | null = null
let unobserve: (() => void) | null = null

const clients = new Set<WebSocketConnection>()

export function defaultStaticRoot(): string {
  return path.join(app.getPath('userData'), 'webui')
}

function staticRoot(): string {
  const configured = getSettings().webuiPath?.trim()
  return configured && configured !== '' ? path.resolve(configured) : defaultStaticRoot()
}

/** Adressen zum Abtippen am Telefon — IPv4 ohne Loopback, dazu `localhost` für den Mac selbst. */
export function reachableAddresses(port: number): string[] {
  const found: string[] = [`http://localhost:${port}`]
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      found.push(`http://${entry.address}:${port}`)
    }
  }
  return found
}

export function getStatus(): RemoteStatus {
  const settings = getSettings()
  const contract = buildContractDescription(app.getVersion())
  return {
    enabled: settings.remoteEnabled,
    running: activePort !== null,
    port: activePort,
    addresses: activePort === null ? [] : reachableAddresses(activePort),
    clientCount: clients.size,
    staticRoot: staticRoot(),
    contractVersion: contract.version,
    error: lastError,
  }
}

function announce(): void {
  emitEvent('remote.changed', getStatus())
}

function httpDeps(): HttpDeps {
  return {
    appVersion: app.getVersion(),
    contract: () => buildContractDescription(app.getVersion()),
    lookupAttachment: (id) => {
      const attachment = getAttachment(id)
      if (!attachment) return null
      return {
        relativePath: attachment.relativePath,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      }
    },
    attachmentsRoot: getAttachmentsRoot,
    staticRoot,
    onRejected: (reason, detail) => log.warn(reason, detail),
  }
}

function broadcast(text: string): void {
  for (const client of clients) {
    if (client.isOpen) client.sendText(text)
  }
}

/**
 * Hängt sich **zusätzlich** an `emitEvent`. Der Renderer bekommt sein Ereignis unverändert und
 * zuerst; hier wird nur weitergegeben. Bewusst ohne Protokollieren — `log.entry` ist selbst ein
 * Ereignis, und eine Meldung je Ereignis wäre eine Rückkopplung.
 */
function forwardEvents(): () => void {
  return observeEvents((event: IpcEventName, payload: unknown) => {
    if (clients.size === 0) return
    broadcast(JSON.stringify(eventMessage(event, payload)))
  })
}

function onConnection(connection: WebSocketConnection): void {
  clients.add(connection)
  const settings = getSettings()
  const contract = buildContractDescription(app.getVersion())
  connection.sendText(
    JSON.stringify(helloMessage(contract.appVersion, contract.version, settings.language)),
  )
  log.info('Gerät verbunden', { clients: String(clients.size) })
  announce()
}

function onText(connection: WebSocketConnection, text: string): void {
  void handleClientMessage(text, { t: mainT() })
    .then((answer) => {
      if ('dropped' in answer) {
        log.warn('Nachricht verworfen', { reason: answer.dropped })
        return
      }
      if (connection.isOpen) connection.sendText(JSON.stringify(answer))
    })
    .catch((error: unknown) => {
      log.error('Aufruf über die Brücke fehlgeschlagen', describeError(error))
    })
}

export function clientCount(): number {
  return clients.size
}

export function isRunning(): boolean {
  return activePort !== null
}

export function start(port: number): Promise<void> {
  if (httpServer) return Promise.resolve()

  // Das Verzeichnis existiert beim ersten Start noch nicht; sonst käme vor dem ersten Bau der
  // Weboberfläche bei jedem Aufruf ein Fehler statt einer 404.
  try {
    mkdirSync(defaultStaticRoot(), { recursive: true })
  } catch (error) {
    log.warn('Verzeichnis der Weboberfläche nicht anlegbar', describeError(error))
  }

  const handle = createRequestHandler(httpDeps())
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      log.error('Anfrage fehlgeschlagen', describeError(error))
      sendJson(response, 500, { error: 'internal_error' })
    })
  })
  httpServer = server

  server.on('upgrade', (request, socket, head) => {
    if ((request.url ?? '').split('?')[0] !== WS_PATH) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    let connection: WebSocketConnection | null = null
    connection = acceptUpgrade(
      request,
      socket,
      head,
      {
        onText: (text) => {
          if (connection) onText(connection, text)
        },
        onClose: () => {
          if (!connection) return
          clients.delete(connection)
          log.info('Gerät getrennt', { clients: String(clients.size) })
          announce()
        },
      },
      PING_INTERVAL_MS,
    )

    if (connection) onConnection(connection)
  })

  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      httpServer = null
      activePort = null
      lastError = error.message
      announce()
      reject(error)
    }
    server.once('error', onError)
    server.listen(port, HOST, () => {
      server.off('error', onError)
      const address = server.address()
      if (address === null || typeof address === 'string') {
        onError(new Error(mainT()('main.remote.noPort')))
        return
      }
      activePort = address.port
      lastError = null
      unobserve = forwardEvents()

      // Ohne Zugangsschutz, auf allen Adressen: beim Start steht im Protokoll, wer herankommt.
      log.warn('Fernzugriff ist offen — keine Authentifizierung', {
        addresses: reachableAddresses(activePort).join(' '),
        webui: staticRoot(),
      })
      announce()
      resolve()
    })
  })
}

export function stop(): Promise<void> {
  const server = httpServer
  httpServer = null
  activePort = null

  unobserve?.()
  unobserve = null

  for (const client of clients) client.close(1001, 'Brücke beendet')
  clients.clear()

  if (!server) {
    announce()
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    server.closeAllConnections()
    server.close(() => {
      log.info('Fernzugriff beendet')
      announce()
      resolve()
    })
  })
}

/**
 * Bringt den Lauf mit den Einstellungen in Übereinstimmung. Wird beim Start der App und nach
 * jedem Speichern der Einstellungen gerufen — an und aus wirkt damit sofort, ohne Neustart.
 */
export async function applySettings(): Promise<void> {
  const { remoteEnabled, remotePort } = getSettings()

  if (!remoteEnabled) {
    if (httpServer) await stop()
    else announce()
    return
  }

  if (activePort === remotePort && httpServer) return
  if (httpServer) await stop()

  try {
    await start(remotePort)
  } catch (error) {
    log.error('Fernzugriff konnte nicht gestartet werden', describeError(error))
  }
}
