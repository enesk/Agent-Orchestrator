import type { AgentActivity, ChatMessage, MessageAttachment, ProjectAgent } from '@shared/types'

export const ACTIVITY_LABELS: Record<AgentActivity, string> = {
  idle: 'untätig',
  thinking: 'denkt',
  writing: 'antwortet',
  tool: 'arbeitet',
  error: 'Fehler',
}

export const ACTIVITY_DOT_CLASSES: Record<AgentActivity, string> = {
  idle: 'bg-ink-faint',
  thinking: 'bg-warning animate-pulse',
  writing: 'bg-success animate-pulse',
  tool: 'bg-info animate-pulse',
  error: 'bg-danger',
}

export function attachmentUrl(attachment: MessageAttachment): string {
  return `attachment://${attachment.relativePath}`
}

export function isImage(attachment: MessageAttachment): boolean {
  return (attachment.mimeType ?? '').startsWith('image/')
}

/** Liest eine Datei als Base64 ohne den `data:`-Präfix, wie `chat.saveAttachment` es erwartet. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Erkennungsmuster für alle Mention-Keys des Projekts. Längere Kürzel stehen vorne, damit
 * `@lena-b` nicht als `@lena` gelesen wird.
 */
export function mentionPattern(agents: ProjectAgent[]): RegExp | null {
  const keys = agents
    .map((agent) => agent.mentionKey)
    .filter((key) => key.length > 1)
    .sort((a, b) => b.length - a.length)
  if (keys.length === 0) return null
  return new RegExp(`(${keys.map(escapeRegExp).join('|')})`, 'gi')
}

export interface TextSegment {
  text: string
  agent: ProjectAgent | null
}

/** Zerlegt einen Text in normale Stücke und erkannte Erwähnungen. */
export function splitMentions(text: string, agents: ProjectAgent[]): TextSegment[] {
  const pattern = mentionPattern(agents)
  if (!pattern) return [{ text, agent: null }]

  const byKey = new Map(agents.map((agent) => [agent.mentionKey.toLowerCase(), agent]))
  const segments: TextSegment[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > last) segments.push({ text: text.slice(last, start), agent: null })
    segments.push({ text: match[0], agent: byKey.get(match[0].toLowerCase()) ?? null })
    last = start + match[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last), agent: null })
  return segments
}

/** Agent-IDs der im Text erwähnten Agenten, in Reihenfolge des Auftretens und ohne Dubletten. */
export function mentionedAgentIds(text: string, agents: ProjectAgent[]): string[] {
  const ids: string[] = []
  for (const segment of splitMentions(text, agents)) {
    if (segment.agent && !ids.includes(segment.agent.id)) ids.push(segment.agent.id)
  }
  return ids
}

const GROUP_WINDOW_MS = 5 * 60 * 1000

/**
 * Zeigt die Nachricht wieder Absender und Zeit, oder schließt sie an die vorige an?
 * Zusammengefasst wird nur, was direkt hintereinander vom selben Absender kommt.
 */
export function startsGroup(message: ChatMessage, previous: ChatMessage | undefined): boolean {
  if (!previous) return true
  if (previous.role !== message.role || previous.agentId !== message.agentId) return true
  if (message.role === 'system') return true
  const gap = new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime()
  return !Number.isFinite(gap) || gap > GROUP_WINDOW_MS
}

const TIME_FORMAT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

export function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : TIME_FORMAT.format(date)
}

const DAY_FORMAT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
})

/** Datumstrenner über dem ersten Beitrag eines Tages — „Heute" und „Gestern" ausgeschrieben. */
export function formatDaySeparator(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const startOfDay = (input: Date): number =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  return DAY_FORMAT.format(date)
}

export function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}
