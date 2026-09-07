/**
 * syncFetch() – UXP-kompatibler HTTP-Wrapper
 *
 * Versucht zuerst native `fetch`, fällt auf `XMLHttpRequest` zurück
 * wenn `fetch` nicht verfügbar ist (UXP-Webview-Kontext).
 * Kommuniziert ausschließlich mit dem lokalen Sync-Server.
 */

const SYNC_SERVER_BASE = 'http://127.0.0.1:5050';
const XHR_TIMEOUT_MS = 5000;

// ── Response-Interface ──

export interface SyncFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}

// ── Request-Optionen ──

export interface SyncFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

// ── Hauptfunktion ──

export async function syncFetch(
  path: string,
  options: SyncFetchOptions = {}
): Promise<SyncFetchResponse> {
  const url = `${SYNC_SERVER_BASE}${path}`;

  if (typeof fetch === 'function') {
    return fetchWithNative(url, options);
  }

  return fetchWithXHR(url, options);
}

// ── Native fetch ──

async function fetchWithNative(
  url: string,
  options: SyncFetchOptions
): Promise<SyncFetchResponse> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
  });

  const responseText = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    json: () => Promise.resolve(JSON.parse(responseText)),
    text: () => Promise.resolve(responseText),
  };
}

// ── XHR-Fallback ──

function fetchWithXHR(
  url: string,
  options: SyncFetchOptions
): Promise<SyncFetchResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method ?? 'GET', url, true);
    xhr.timeout = XHR_TIMEOUT_MS;

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.onload = () => {
      const responseText = xhr.responseText;
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: () => Promise.resolve(JSON.parse(responseText)),
        text: () => Promise.resolve(responseText),
      });
    };

    xhr.onerror = () => {
      reject(new Error(`Netzwerkfehler: ${url} nicht erreichbar`));
    };

    xhr.ontimeout = () => {
      reject(new Error(`Timeout nach ${XHR_TIMEOUT_MS}ms: ${url}`));
    };

    xhr.send(options.body ?? null);
  });
}
