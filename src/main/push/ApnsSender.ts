import { connect, constants, type ClientHttp2Session } from 'node:http2'
import type { PushEnvironment } from '@shared/types'
import type { Translator } from '@shared/i18n'
import {
  ApnsKeyError,
  loadSigningKey,
  ProviderTokenCache,
  type ApnsCredentials,
} from './jwt'
import { APNS_HOSTS, devicePath, type ApnsMessage } from './payload'

/**
 * Der Weg zu APNs. **Keine neue Abhängigkeit:** Node bringt HTTP/2 mit (`node:http2`), und
 * APNs spricht nichts anderes. Eine Sitzung je Umgebung wird offen gehalten — Apple erwartet
 * genau das, ein TLS-Handshake je Meldung wäre teuer und auffällig.
 *
 * Das Ergebnis ist **immer** ein `ApnsDelivery`, nie eine Ausnahme. Diese Klasse hängt am
 * Ereignisstrom der App; ein geplatzter Versand darf keinen Agentenlauf anhalten.
 */

export interface ApnsDelivery {
  ok: boolean
  /** HTTP-Status von APNs; `null`, wenn es nicht bis dorthin kam. */
  status: number | null
  /** Apples `reason`, z.B. `BadDeviceToken`, `ExpiredProviderToken`, `TopicDisallowed`. */
  reason: string | null
  /** Für Menschen, in der eingestellten Sprache. */
  message: string | null
  apnsId: string | null
}

export interface ApnsSender {
  send(
    environment: PushEnvironment,
    deviceToken: string,
    message: ApnsMessage,
  ): Promise<ApnsDelivery>
  /** `null` nimmt den Schlüssel wieder weg — danach schlägt jeder Versand sauber fehl. */
  setCredentials(credentials: ApnsCredentials | null): void
  close(): Promise<void>
}

/** Nach so langer Stille gilt eine Meldung als nicht zugestellt. */
const REQUEST_TIMEOUT_MS = 10_000

const CONNECT_TIMEOUT_MS = 10_000

export interface Http2ApnsSenderOptions {
  t: () => Translator
  /** Nur für den Test: eine andere Adresse als die von Apple. */
  hosts?: Record<PushEnvironment, string>
  /**
   * Nur für den Test: ein anderer Verbindungsaufbau. Der Sicherheitstest fährt damit einen
   * HTTP/2-Server auf dem Loopback an und kann so Kopfzeilen, Pfad, Provider-Token und
   * Nutzlast bis zur Zustellung nachprüfen — ohne Zertifikat und ohne Apple.
   */
  connect?: (origin: string) => ClientHttp2Session
  now?: () => number
}

export class Http2ApnsSender implements ApnsSender {
  private readonly sessions = new Map<PushEnvironment, ClientHttp2Session>()
  private readonly tokens: ProviderTokenCache
  private credentials: ApnsCredentials | null = null
  private generation = 0
  private closed = false

  constructor(private readonly options: Http2ApnsSenderOptions) {
    this.tokens = new ProviderTokenCache(options.now ?? Date.now)
  }

  setCredentials(credentials: ApnsCredentials | null): void {
    this.credentials = credentials
    this.generation += 1
    this.tokens.clear()
  }

  async send(
    environment: PushEnvironment,
    deviceToken: string,
    message: ApnsMessage,
  ): Promise<ApnsDelivery> {
    const t = this.options.t()

    if (this.closed) return failure(t('main.push.senderClosed'))
    if (!this.credentials) return failure(t('main.push.noKey'))

    let authorization: string
    try {
      const key = loadSigningKey(this.credentials.p8, {
        notAKey: t('main.push.keyNotAKey'),
        wrongCurve: t('main.push.keyWrongCurve'),
      })
      authorization = `bearer ${this.tokens.get(
        key,
        this.credentials.keyId,
        this.credentials.teamId,
        String(this.generation),
      )}`
    } catch (error) {
      return failure(
        error instanceof ApnsKeyError ? error.message : t('main.push.keyNotAKey'),
        'InvalidProviderToken',
      )
    }

    try {
      return await this.request(environment, deviceToken, message, authorization)
    } catch (error) {
      return failure(
        t('main.push.transportFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.tokens.clear()
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(
      sessions.map(
        (session) =>
          new Promise<void>((resolve) => {
            if (session.closed || session.destroyed) {
              resolve()
              return
            }
            session.close(() => resolve())
          }),
      ),
    )
  }

  private host(environment: PushEnvironment): string {
    return (this.options.hosts ?? APNS_HOSTS)[environment]
  }

  /**
   * Die offene Sitzung einer Umgebung, oder eine neue. Sitzungen fallen von selbst weg: APNs
   * schickt irgendwann ein GOAWAY, und dann wird beim nächsten Mal neu verbunden.
   */
  private session(environment: PushEnvironment): ClientHttp2Session {
    const existing = this.sessions.get(environment)
    if (existing && !existing.closed && !existing.destroyed) return existing

    const origin = `https://${this.host(environment)}`
    const session = (this.options.connect ?? connect)(origin)
    session.setTimeout(CONNECT_TIMEOUT_MS, () => {
      // Ohne eigene Behandlung wirft `setTimeout` nichts — die offene Anfrage läuft sonst in
      // ihre eigene Zeitüberschreitung und die Sitzung bleibt als Leiche liegen.
      session.destroy()
    })
    const forget = (): void => {
      if (this.sessions.get(environment) === session) this.sessions.delete(environment)
    }
    session.on('close', forget)
    session.on('goaway', forget)
    // Ohne Zuhörer wäre ein Sitzungsfehler eine unbehandelte Ausnahme im Main-Prozess.
    session.on('error', forget)

    this.sessions.set(environment, session)
    return session
  }

  private request(
    environment: PushEnvironment,
    deviceToken: string,
    message: ApnsMessage,
    authorization: string,
  ): Promise<ApnsDelivery> {
    const t = this.options.t()
    const body = Buffer.from(JSON.stringify(message.body), 'utf8')

    return new Promise<ApnsDelivery>((resolve) => {
      let settled = false
      const settle = (delivery: ApnsDelivery): void => {
        if (settled) return
        settled = true
        resolve(delivery)
      }

      let stream: ReturnType<ClientHttp2Session['request']>
      try {
        stream = this.session(environment).request({
          [constants.HTTP2_HEADER_METHOD]: 'POST',
          [constants.HTTP2_HEADER_PATH]: devicePath(deviceToken),
          [constants.HTTP2_HEADER_AUTHORITY]: this.host(environment),
          [constants.HTTP2_HEADER_CONTENT_TYPE]: 'application/json',
          [constants.HTTP2_HEADER_CONTENT_LENGTH]: String(body.length),
          authorization,
          ...message.headers,
        })
      } catch (error) {
        settle(
          failure(
            t('main.push.transportFailed', {
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        )
        return
      }

      stream.setTimeout(REQUEST_TIMEOUT_MS, () => {
        stream.close(constants.NGHTTP2_CANCEL)
        settle(failure(t('main.push.timeout')))
      })

      let status: number | null = null
      let apnsId: string | null = null
      const chunks: Buffer[] = []

      stream.on('response', (headers) => {
        const raw = headers[constants.HTTP2_HEADER_STATUS]
        status = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
        const id = headers['apns-id']
        apnsId = typeof id === 'string' ? id : null
      })

      stream.on('data', (chunk: Buffer) => chunks.push(chunk))

      stream.on('error', (error: Error) => {
        settle(failure(t('main.push.transportFailed', { error: error.message })))
      })

      stream.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const reason = readReason(text)

        if (status === 200) {
          settle({ ok: true, status, reason: null, message: null, apnsId })
          return
        }

        settle({
          ok: false,
          status,
          reason,
          message: t('main.push.rejected', {
            status: status ?? 0,
            reason: reason ?? (text.slice(0, 200) || '—'),
          }),
          apnsId,
        })
      })

      stream.end(body)
    })
  }
}

function failure(message: string, reason: string | null = null): ApnsDelivery {
  return { ok: false, status: null, reason, message, apnsId: null }
}

/** APNs begründet jede Ablehnung mit `{"reason":"…"}`. */
function readReason(text: string): string | null {
  if (text.trim() === '') return null
  try {
    const parsed = JSON.parse(text) as { reason?: unknown }
    return typeof parsed.reason === 'string' ? parsed.reason : null
  } catch {
    return null
  }
}

/**
 * Gerätetoken, die APNs dauerhaft ablehnt. Ein Gerät mit solchem Token wird aus der Liste
 * genommen — es kommt nie wieder, und jede weitere Meldung dorthin wäre verschwendet.
 */
export const DEAD_TOKEN_REASONS: readonly string[] = [
  'BadDeviceToken',
  'DeviceTokenNotForTopic',
  'Unregistered',
]
