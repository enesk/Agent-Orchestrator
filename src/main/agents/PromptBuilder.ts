import { TICKET_STATUS_LABELS } from '@shared/constants'
import type { Agent, ChatMessage, Project, ProjectAgent, Ticket } from '@shared/types'
import { listMessages } from '../db/repositories/messages'
import { listProjectAgents } from '../db/repositories/agents'
import { list as listDocuments } from '../documents/DocumentService'
import { TOOL_INSTRUCTIONS } from '../mcp/toolInstructions'
import { buildBlock, getForPrompt } from '../memory/MemoryService'
import { list as listTickets } from '../tickets/TicketService'
import {
  MESSAGE_ATTACHMENT_INTRO,
  MESSAGE_ATTACHMENT_TITLE,
  attachmentPromptBody,
} from './attachmentPrompt'

/**
 * Baut den Prompt eines Chat-Laufs. Zwei Varianten, weil der Unterschied bares Geld ist:
 * ein Kaltstart braucht Systemprompt, Rollenregeln und Werkzeug-Hinweise, ein fortgesetzter
 * Lauf hat das alles schon im Transkript und bekommt nur den frischen Kontext.
 */

/** So viele Nachrichten des Verlaufs gehen in einen Kaltstart bzw. in einen Resume. */
const FULL_HISTORY_LIMIT = 30
const RESUME_HISTORY_LIMIT = 15
/** So viele Nachrichten werden durchsucht, um die relevanten herauszufiltern. */
const HISTORY_SCAN_LIMIT = 250
const TICKET_LIMIT = 80
const DOCUMENT_LIMIT = 60
const MESSAGE_CLIP = 1_200

export interface PromptInput {
  project: Project
  agent: Agent
  /** Die Nachricht, die den Lauf ausgelöst hat — Quelle für Thread und Anhänge. */
  trigger: ChatMessage | null
  /** Der eigentliche Auftrag, wie er dem Agenten gestellt wird. */
  task: string
}

export function buildFull(input: PromptInput): string {
  const peers = listProjectAgents(input.project.id)
  return join([
    attachmentBlock(input.trigger),
    input.agent.systemPrompt.trim(),
    roleBlock(input.agent, peers),
    TOOL_INSTRUCTIONS,
    projectBlock(input.project),
    ticketBlock(input.project.id, peers),
    documentBlock(input.project.id),
    memoryBlock(input.agent.id, input.project.id),
    threadBlock(input.trigger, peers),
    historyBlock(input, peers, FULL_HISTORY_LIMIT),
    taskBlock(input.task),
  ])
}

export function buildResume(input: PromptInput): string {
  const peers = listProjectAgents(input.project.id)
  return join([
    attachmentBlock(input.trigger),
    ticketBlock(input.project.id, peers),
    documentBlock(input.project.id),
    memoryBlock(input.agent.id, input.project.id),
    threadBlock(input.trigger, peers),
    historyBlock(input, peers, RESUME_HISTORY_LIMIT),
    taskBlock(input.task),
  ])
}

function join(blocks: (string | null)[]): string {
  return blocks
    .map((block) => block?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
}

function section(title: string, body: string): string | null {
  const content = body.trim()
  return content ? `## ${title}\n${content}` : null
}

function attachmentBlock(trigger: ChatMessage | null): string | null {
  if (!trigger) return null
  const body = attachmentPromptBody(trigger.attachments, MESSAGE_ATTACHMENT_INTRO)
  return body ? section(MESSAGE_ATTACHMENT_TITLE, body) : null
}

function roleBlock(agent: Agent, peers: ProjectAgent[]): string {
  const others = peers.filter((peer) => peer.id !== agent.id)
  const lines = [
    `Du bist ${agent.name}${agent.title ? ` (${agent.title})` : ''} in einem Projekt-Chat.`,
    `Dein Mention-Key ist ${agent.mentionKey}.`,
  ]

  if (others.length > 0) {
    lines.push('', 'Weitere Agenten in diesem Projekt:')
    for (const peer of others) {
      const title = peer.title ? ` — ${peer.title}` : ''
      lines.push(`- ${peer.mentionKey} · ${peer.name}${title}${peer.stopped ? ' (gestoppt)' : ''}`)
    }
    lines.push(
      '',
      'Eine Erwähnung startet den anderen Agenten sofort. Erwähne deshalb nur, wenn du eine',
      'konkrete Aufgabe oder eine konkrete Frage an ihn hast — nie, um zu bestätigen, zu danken',
      'oder zusammenzufassen. Dich selbst zu erwähnen bewirkt nichts.',
    )
  }

  return `## Deine Rolle im Chat\n${lines.join('\n')}`
}

function projectBlock(project: Project): string {
  const lines = [`Name: ${project.name}`, `Pfad: ${project.path ?? '— kein Pfad hinterlegt —'}`]
  if (project.description?.trim()) lines.push(`Beschreibung: ${project.description.trim()}`)
  for (const [key, value] of Object.entries(project.metadata)) {
    if (value === null || value === undefined || value === '') continue
    lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
  }
  return `## Projekt\n${lines.join('\n')}`
}

/** Kompakte Übersicht: Nummer, Titel, Status, Zuweisung — bewusst ohne Beschreibungen. */
function ticketBlock(projectId: string, peers: ProjectAgent[]): string | null {
  const tickets = listTickets({ projectId })
  if (tickets.length === 0) return null

  const byId = new Map(peers.map((peer) => [peer.id, peer]))
  const format = (ticket: Ticket): string => {
    const assignee = ticket.assignedAgentId ? byId.get(ticket.assignedAgentId) : null
    const suffix = assignee ? ` — ${assignee.mentionKey}` : ''
    return `#${ticket.number} [${TICKET_STATUS_LABELS[ticket.status]}] ${ticket.title}${suffix}`
  }

  const shown = tickets.slice(0, TICKET_LIMIT).map(format)
  if (tickets.length > TICKET_LIMIT) {
    shown.push(`… und ${tickets.length - TICKET_LIMIT} weitere. Nutze ticket_list für den Rest.`)
  }
  return section('Tickets', shown.join('\n'))
}

function documentBlock(projectId: string): string | null {
  const documents = listDocuments(projectId)
  if (documents.length === 0) return null
  const shown = documents.slice(0, DOCUMENT_LIMIT).map((document) => `- ${document.title}`)
  if (documents.length > DOCUMENT_LIMIT) {
    shown.push(`- … und ${documents.length - DOCUMENT_LIMIT} weitere`)
  }
  return section('Dokumente (Inhalt über doc_get)', shown.join('\n'))
}

function memoryBlock(agentId: string, projectId: string): string | null {
  return section('Was du dir gemerkt hast', buildBlock(getForPrompt(agentId, projectId)))
}

function threadBlock(trigger: ChatMessage | null, peers: ProjectAgent[]): string | null {
  const rootId = trigger?.replyToId
  if (!trigger || !rootId) return null

  const thread = listMessages({ projectId: trigger.projectId, limit: HISTORY_SCAN_LIMIT }).filter(
    (message) => message.id === rootId || message.replyToId === rootId,
  )
  const lines = thread
    .filter((message) => message.id !== trigger.id)
    .map((message) => renderMessage(message, peers))
  return section('Thread, in dem die Nachricht hängt', lines.join('\n'))
}

/**
 * Der Verlauf, der diesen Agenten wirklich betrifft: was er selbst gesagt hat, was an ihn
 * gerichtet war, und der Thread der auslösenden Nachricht. Alles andere kostet nur Tokens.
 */
function historyBlock(input: PromptInput, peers: ProjectAgent[], limit: number): string | null {
  const rootId = input.trigger?.replyToId ?? null
  const relevant = listMessages({ projectId: input.project.id, limit: HISTORY_SCAN_LIMIT })
    .filter((message) => message.id !== input.trigger?.id)
    .filter((message) => message.content.trim().length > 0)
    .filter(
      (message) =>
        message.agentId === input.agent.id ||
        message.mentions.includes(input.agent.id) ||
        // An alle gerichtete Nutzer-Nachrichten sind der gemeinsame Kontext des Chats.
        (message.role === 'user' && message.mentions.length === 0) ||
        (rootId !== null && (message.id === rootId || message.replyToId === rootId)),
    )
    .slice(-limit)

  return section('Bisheriger Verlauf', relevant.map((message) => renderMessage(message, peers)).join('\n'))
}

function renderMessage(message: ChatMessage, peers: ProjectAgent[]): string {
  const author =
    message.role === 'user'
      ? 'Nutzer'
      : message.role === 'system'
        ? 'System'
        : (peers.find((peer) => peer.id === message.agentId)?.name ?? 'Agent')
  return `[${time(message.createdAt)}] ${author}: ${clip(message.content)}`
}

function taskBlock(task: string): string {
  return `## Deine Aufgabe\n${task.trim()}`
}

function time(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function clip(text: string, limit = MESSAGE_CLIP): string {
  const trimmed = text.trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit)} […]` : trimmed
}
