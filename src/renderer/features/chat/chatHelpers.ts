/**
 * Breite und Zentrierung des Hauptverlaufs. Nachrichtenliste und Eingabefeld teilen sie sich,
 * damit beide exakt übereinanderliegen; der scrollende Bereich bleibt fensterbreit.
 */
export const CHAT_COLUMN = 'mx-auto w-full max-w-3xl'

import type { TranslationKey, Translator } from '@shared/i18n'
import type { AgentActivity, ChatMessage, ProjectAgent } from '@shared/types'

// Anhänge sind überall gleich — Chat, Ticket und Verlauf teilen sich dieselben Helfer.
export { attachmentUrl, isImage, readFileAsBase64 } from '../attachments'

export const ACTIVITY_LABEL_KEYS: Record<AgentActivity, TranslationKey> = {
  idle: 'chat.activity.idle',
  thinking: 'chat.activity.thinking',
  writing: 'chat.activity.writing',
  tool: 'chat.activity.tool',
  error: 'chat.activity.error',
}

export const ACTIVITY_DOT_CLASSES: Record<AgentActivity, string> = {
  idle: 'bg-ink-faint',
  thinking: 'bg-warning animate-pulse',
  writing: 'bg-success animate-pulse',
  tool: 'bg-info animate-pulse',
  error: 'bg-danger',
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

/**
 * Der Agent, den die App im Thread selbst ergänzt hat, weil der Nutzer niemanden erwähnte.
 * Sein Text bleibt unverändert — deshalb steht die Zuordnung in den Metadaten, nicht im Inhalt.
 */
export function autoMentionAgent(
  message: ChatMessage,
  agents: ProjectAgent[],
): ProjectAgent | null {
  const id = message.metadata.autoMention
  if (typeof id !== 'string') return null
  return agents.find((agent) => agent.id === id) ?? null
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

const dayFormats = new Map<string, Intl.DateTimeFormat>()

function dayFormat(locale: string): Intl.DateTimeFormat {
  let formatter = dayFormats.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long' })
    dayFormats.set(locale, formatter)
  }
  return formatter
}

/** Datumstrenner über dem ersten Beitrag eines Tages — „Heute" und „Gestern" ausgeschrieben. */
export function formatDaySeparator(value: string, t: Translator): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const startOfDay = (input: Date): number =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days === 0) return t('chat.day.today')
  if (days === 1) return t('chat.day.yesterday')
  return dayFormat(t.locale).format(date)
}

export function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}
