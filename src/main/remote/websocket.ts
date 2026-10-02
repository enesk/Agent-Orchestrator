import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

/**
 * Ein kleiner WebSocket-Server nach RFC 6455 auf `node:net`-Sockets. **Keine neue
 * Abhängigkeit** — `ws` liegt nicht in den Laufzeit-Abhängigkeiten, und die Brücke braucht nur
 * Textnachrichten, Ping/Pong und ein sauberes Close. Gegenstelle ist ein Browser, der sich an
 * das Protokoll hält; was nicht passt, wird mit Close-Code abgewiesen statt gerettet.
 *
 * Ohne `electron`, damit die Rahmenkodierung im Test ohne App läuft.
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** Opcodes, die wir kennen. Alles andere beendet die Verbindung. */
const OP_CONTINUATION = 0x0
const OP_TEXT = 0x1
const OP_BINARY = 0x2
const OP_CLOSE = 0x8
const OP_PING = 0x9
const OP_PONG = 0xa

/**
 * Eine Nachricht über die Brücke ist JSON mit einem Vertrags-Request. `chat.saveAttachment`
 * schickt eine Datei als Base64 — deshalb nicht zu knapp, aber auch nicht unbegrenzt.
 */
export const MAX_MESSAGE_BYTES = 24 * 1024 * 1024

export function acceptKey(clientKey: string): string {
  return createHash('sha1').update(`${clientKey}${GUID}`, 'utf8').digest('base64')
}

export interface UpgradeCheck {
  ok: boolean
  /** Gesetzt, wenn `ok` falsch ist: die Zeile, die der Client stattdessen bekommt. */
  reason?: string
  key?: string
}

export function checkUpgrade(request: IncomingMessage): UpgradeCheck {
  const headers = request.headers
  const upgrade = String(headers.upgrade ?? '').toLowerCase()
  if (upgrade !== 'websocket') return { ok: false, reason: 'kein WebSocket-Upgrade' }

  const version = String(headers['sec-websocket-version'] ?? '')
  if (version !== '13') return { ok: false, reason: `Version ${version || 'fehlt'}` }

  const key = headers['sec-websocket-key']
  if (typeof key !== 'string' || key.trim() === '') return { ok: false, reason: 'Schlüssel fehlt' }

  return { ok: true, key: key.trim() }
}

export function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length
  let header: Buffer

  if (length < 126) {
    header = Buffer.alloc(2)
    header[1] = length
  } else if (length < 0x10000) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    // Kein `writeUInt64BE` in Node; die obere Hälfte bleibt null, 4 GiB reichen hier weit.
    header.writeUInt32BE(0, 2)
    header.writeUInt32BE(length, 6)
  }

  // FIN gesetzt, keine Erweiterungen, der Server maskiert nicht.
  header[0] = 0x80 | opcode
  return Buffer.concat([header, payload])
}

export interface DecodedFrame {
  fin: boolean
  opcode: number
  payload: Buffer
}

export interface FrameReadError {
  code: number
  reason: string
}

/**
 * Liest einen Rahmen vom Anfang des Puffers. `null` heißt „noch nicht vollständig“.
 * Der Aufrufer schneidet `consumed` Bytes ab.
 */
export function decodeFrame(
  buffer: Buffer,
): { frame: DecodedFrame; consumed: number } | FrameReadError | null {
  if (buffer.length < 2) return null

  const first = buffer[0]!
  const second = buffer[1]!

  if ((first & 0x70) !== 0) return { code: 1002, reason: 'Erweiterungsbits gesetzt' }

  const fin = (first & 0x80) !== 0
  const opcode = first & 0x0f
  const masked = (second & 0x80) !== 0
  let length = second & 0x7f
  let offset = 2

  // Ein Client **muss** maskieren; unmaskierte Rahmen sind laut RFC abzuweisen.
  if (!masked) return { code: 1002, reason: 'Rahmen nicht maskiert' }

  if (length === 126) {
    if (buffer.length < offset + 2) return null
    length = buffer.readUInt16BE(offset)
    offset += 2
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null
    const high = buffer.readUInt32BE(offset)
    const low = buffer.readUInt32BE(offset + 4)
    if (high !== 0) return { code: 1009, reason: 'Nachricht zu groß' }
    length = low
    offset += 8
  }

  if (length > MAX_MESSAGE_BYTES) return { code: 1009, reason: 'Nachricht zu groß' }

  // Steuerrahmen (0x8–0xF) tragen höchstens 125 Byte und dürfen nicht zerstückelt sein.
  if ((opcode & 0x8) !== 0) {
    if (!fin) return { code: 1002, reason: 'Steuerrahmen zerstückelt' }
    if (length > 125) return { code: 1002, reason: 'Steuerrahmen zu lang' }
  }

  if (buffer.length < offset + 4 + length) return null

  const mask = buffer.subarray(offset, offset + 4)
  offset += 4

  const payload = Buffer.allocUnsafe(length)
  for (let index = 0; index < length; index += 1) {
    payload[index] = buffer[offset + index]! ^ mask[index % 4]!
  }

  return { frame: { fin, opcode, payload }, consumed: offset + length }
}

export interface ConnectionHandlers {
  onText: (text: string) => void
  onClose: (code: number, reason: string) => void
}

/**
 * Eine offene Verbindung. Lebenszeichen: alle 25 Sekunden ein Ping; bleibt zweimal in Folge
 * ein Pong aus, wird geschlossen — so wie im Drahtprotokoll beschrieben.
 */
export class WebSocketConnection {
  private buffer: Buffer = Buffer.alloc(0)
  private fragments: Buffer[] = []
  private fragmentOpcode: number | null = null
  private fragmentBytes = 0
  private closed = false
  private missedPongs = 0
  private heartbeat: NodeJS.Timeout | null = null

  constructor(
    private readonly socket: Duplex,
    private readonly handlers: ConnectionHandlers,
    private readonly pingIntervalMs: number,
  ) {
    socket.on('data', (chunk: Buffer) => this.receive(chunk))
    socket.on('error', () => this.finish(1006, 'Socket-Fehler'))
    socket.on('close', () => this.finish(1006, 'Socket geschlossen'))
    socket.on('end', () => this.finish(1000, 'Gegenstelle beendet'))

    this.heartbeat = setInterval(() => this.beat(), this.pingIntervalMs)
    // Der Takt darf den Prozess nicht am Beenden hindern.
    this.heartbeat.unref?.()
  }

  get isOpen(): boolean {
    return !this.closed
  }

  sendText(text: string): void {
    if (this.closed) return
    this.socket.write(encodeFrame(OP_TEXT, Buffer.from(text, 'utf8')))
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason, 'utf8'))
    payload.writeUInt16BE(code, 0)
    payload.write(reason, 2, 'utf8')
    try {
      this.socket.write(encodeFrame(OP_CLOSE, payload))
    } catch {
      // Ein toter Socket braucht kein Close mehr.
    }
    this.finish(code, reason)
    this.socket.end()
  }

  private beat(): void {
    if (this.closed) return
    if (this.missedPongs >= 2) {
      this.close(1001, 'Keine Antwort')
      return
    }
    this.missedPongs += 1
    this.socket.write(encodeFrame(OP_PING, Buffer.alloc(0)))
  }

  private finish(code: number, reason: string): void {
    if (this.closed) return
    this.closed = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.buffer = Buffer.alloc(0)
    this.fragments = []
    this.handlers.onClose(code, reason)
  }

  private receive(chunk: Buffer): void {
    if (this.closed) return
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])

    if (this.buffer.length > MAX_MESSAGE_BYTES + 1024) {
      this.close(1009, 'Nachricht zu groß')
      return
    }

    for (;;) {
      const read = decodeFrame(this.buffer)
      if (read === null) return
      if (!('frame' in read)) {
        this.close(read.code, read.reason)
        return
      }

      this.buffer = this.buffer.subarray(read.consumed)
      if (!this.handleFrame(read.frame)) return
    }
  }

  /** `false` heißt: die Verbindung ist zu, nicht weiterlesen. */
  private handleFrame(frame: DecodedFrame): boolean {
    switch (frame.opcode) {
      case OP_PING:
        this.socket.write(encodeFrame(OP_PONG, frame.payload))
        return true

      case OP_PONG:
        this.missedPongs = 0
        return true

      case OP_CLOSE: {
        const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1005
        this.close(code === 1005 ? 1000 : code, '')
        return false
      }

      case OP_TEXT:
      case OP_BINARY: {
        if (this.fragmentOpcode !== null) {
          this.close(1002, 'Neue Nachricht in laufender Zerstückelung')
          return false
        }
        if (frame.fin) return this.deliver(frame.opcode, frame.payload)
        this.fragmentOpcode = frame.opcode
        this.fragments = [frame.payload]
        this.fragmentBytes = frame.payload.length
        return true
      }

      case OP_CONTINUATION: {
        if (this.fragmentOpcode === null) {
          this.close(1002, 'Fortsetzung ohne Anfang')
          return false
        }
        this.fragmentBytes += frame.payload.length
        if (this.fragmentBytes > MAX_MESSAGE_BYTES) {
          this.close(1009, 'Nachricht zu groß')
          return false
        }
        this.fragments.push(frame.payload)
        if (!frame.fin) return true

        const opcode = this.fragmentOpcode
        const payload = Buffer.concat(this.fragments)
        this.fragmentOpcode = null
        this.fragments = []
        this.fragmentBytes = 0
        return this.deliver(opcode, payload)
      }

      default:
        this.close(1003, `Opcode ${frame.opcode} nicht unterstützt`)
        return false
    }
  }

  private deliver(opcode: number, payload: Buffer): boolean {
    if (opcode === OP_BINARY) {
      // Das Drahtprotokoll kennt nur JSON als Text.
      this.close(1003, 'Nur Textnachrichten')
      return false
    }
    this.handlers.onText(payload.toString('utf8'))
    return !this.closed
  }
}

/** Schreibt die 101-Antwort und übergibt den Socket an eine Verbindung. */
export function acceptUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  handlers: ConnectionHandlers,
  pingIntervalMs: number,
): WebSocketConnection | null {
  const check = checkUpgrade(request)
  if (!check.ok || !check.key) {
    socket.write(`HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n${check.reason ?? ''}`)
    socket.destroy()
    return null
  }

  // `upgrade` liefert immer einen `net.Socket`; der Typ der Signatur ist nur ein `Duplex`.
  const nagle = (socket as unknown as { setNoDelay?: (on: boolean) => void }).setNoDelay
  if (typeof nagle === 'function') nagle.call(socket, true)

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey(check.key)}`,
      '\r\n',
    ].join('\r\n'),
  )

  // Daten, die schon vor dem Upgrade mitgekommen sind, dürfen nicht verloren gehen — und das
  // muss passieren, bevor die Verbindung den Socket ins Fließen bringt.
  if (head.length > 0) socket.unshift(head)

  return new WebSocketConnection(socket, handlers, pingIntervalMs)
}
