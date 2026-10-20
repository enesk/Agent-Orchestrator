import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto'

/**
 * Das Provider-Token für APNs: ein JWT mit ES256, signiert mit dem `.p8`-Schlüssel aus dem
 * Developer-Konto. Apple verlangt genau das — `alg: ES256`, `kid` = Key-ID im Kopf,
 * `iss` = Team-ID und `iat` in den Ansprüchen.
 *
 * **Keine Abhängigkeit dafür.** `node:crypto` kann ES256 von sich aus, und der einzige
 * Stolperstein ist die Signaturkodierung: `createSign` liefert DER, JWS will die rohen
 * 64 Byte R‖S. `dsaEncoding: 'ieee-p1363'` erledigt genau das.
 *
 * Ohne `electron`, damit der Sicherheitstest das Token ohne App nachrechnen kann.
 */

/** Apple lässt ein Provider-Token höchstens eine Stunde gelten. */
export const TOKEN_LIFETIME_MS = 60 * 60 * 1000

/**
 * Wann ein Token ersetzt wird. Mit Absicht deutlich vor der Stunde, aber auch deutlich
 * darüber, was Apple als Mindestabstand zwischen zwei Token erwartet (20 Minuten): wer zu
 * oft ein neues bildet, bekommt `TooManyProviderTokenUpdates`.
 */
export const TOKEN_REFRESH_MS = 50 * 60 * 1000

export interface ApnsCredentials {
  /** Der Inhalt der `.p8`-Datei, PKCS#8 mit Klartext-Rahmen. */
  p8: string
  keyId: string
  teamId: string
}

export class ApnsKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApnsKeyError'
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Liest den `.p8`-Inhalt und prüft, dass es wirklich ein P-256-Schlüssel ist. Ein Zertifikat,
 * ein RSA-Schlüssel oder eine verschlüsselte Datei fällt hier auf — und nicht erst, wenn APNs
 * mit `403 InvalidProviderToken` antwortet.
 *
 * `messages` kommt von außen, damit dieses Modul ohne Übersetzer auskommt.
 */
export function loadSigningKey(
  p8: string,
  messages: { notAKey: string; wrongCurve: string },
): KeyObject {
  let key: KeyObject
  try {
    key = createPrivateKey({ key: p8, format: 'pem' })
  } catch (error) {
    throw new ApnsKeyError(`${messages.notAKey} ${error instanceof Error ? error.message : ''}`.trim())
  }

  if (key.asymmetricKeyType !== 'ec') throw new ApnsKeyError(messages.notAKey)

  const curve = key.asymmetricKeyDetails?.namedCurve
  if (curve !== 'prime256v1') throw new ApnsKeyError(messages.wrongCurve)

  return key
}

export interface ProviderToken {
  token: string
  /** Wann es gebildet wurde — der Zwischenspeicher entscheidet daran, wann er es ersetzt. */
  issuedAt: number
}

/**
 * Baut und signiert das Token. `now` ist überschreibbar, damit der Test die Ansprüche
 * nachrechnen kann, ohne auf die Uhr zu warten.
 */
export function createProviderToken(
  key: KeyObject,
  keyId: string,
  teamId: string,
  now: number = Date.now(),
): ProviderToken {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  const claims = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }))
  const signingInput = `${header}.${claims}`

  const signature = sign('sha256', Buffer.from(signingInput, 'utf8'), {
    key,
    dsaEncoding: 'ieee-p1363',
  })

  return { token: `${signingInput}.${base64url(signature)}`, issuedAt: now }
}

export interface DecodedProviderToken {
  header: { alg?: unknown; kid?: unknown; typ?: unknown }
  claims: { iss?: unknown; iat?: unknown }
  signatureBytes: number
}

/** Liest ein Token zurück, ohne die Signatur zu prüfen. Für Protokoll und Test. */
export function decodeProviderToken(token: string): DecodedProviderToken | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')),
      claims: JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')),
      signatureBytes: Buffer.from(parts[2]!, 'base64url').length,
    }
  } catch {
    return null
  }
}

/**
 * Prüft die Signatur gegen den öffentlichen Teil des Schlüssels. Die App braucht das nicht —
 * APNs prüft —, aber der Sicherheitstest kann damit belegen, dass wirklich signiert wurde,
 * und nicht nur etwas angehängt.
 */
export function verifyProviderToken(token: string, key: KeyObject): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  return verify(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'),
    { key: createPublicKey(key), dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2]!, 'base64url'),
  )
}

/**
 * Hält ein Token, solange es frisch ist. Ein Token je Lauf der App genügt — es gilt für alle
 * Geräte und beide Umgebungen, und jede Meldung neu zu signieren wäre Verschwendung.
 */
export class ProviderTokenCache {
  private current: ProviderToken | null = null
  private signature: string | null = null

  constructor(private readonly now: () => number = Date.now) {}

  /** `credentialsSignature` wechselt, wenn der Nutzer einen anderen Schlüssel hinterlegt. */
  get(key: KeyObject, keyId: string, teamId: string, credentialsSignature: string): string {
    const fresh =
      this.current !== null &&
      this.signature === credentialsSignature &&
      this.now() - this.current.issuedAt < TOKEN_REFRESH_MS

    if (!fresh) {
      this.current = createProviderToken(key, keyId, teamId, this.now())
      this.signature = credentialsSignature
    }

    return this.current!.token
  }

  clear(): void {
    this.current = null
    this.signature = null
  }
}
