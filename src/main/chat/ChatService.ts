import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  Agent,
  AgentActivity,
  ChatMessage,
  JsonObject,
  MessageAttachment,
  Project,
  ProjectAgent,
} from '@shared/types'
import { buildFull, buildResume } from '../agents/PromptBuilder'
import { isStopped } from '../agents/AgentService'
import { getAttachmentsRoot, removeAttachmentFolders } from '../app/attachments'
import { notifyAgentDone, notifyError } from '../app/notifications'
import {
  RateLimitError,
  buildScopeKey,
  killByFilter,
  run as startClaudeRun,
  type RunHandle,
} from '../claude'
import { listAgents, listProjectAgents } from '../db/repositories/agents'
import {
  attachToMessage,
  clearProjectMessages,
  countMessagesToClear,
  createAttachment,
  createMessage,
  deleteMessage as deleteMessageRow,
  getMessage,
  listMessages,
  listThread,
  updateMessage,
  type ListMessagesOptions,
} from '../db/repositories/messages'
import { getProject } from '../db/repositories/projects'
import { listSkillsForAgent } from '../db/repositories/skills'
import { deleteSessionsForProject, getSession } from '../db/repositories/sessions'
import { emitEvent } from '../ipc/events'
import { withRunContext } from '../mcp'
import { describeError, scopedLogger } from '../Logger'
import { describeRunFailure } from './errors'
import { mentionedAgents, mentionedOutsideProject, resolveMentions } from './mentions'
import { resolveThreadTarget, type ThreadTarget } from './threadTarget'
import { toolLabel } from './toolLabels'
import { mainT } from '../app/settings'

const log = scopedLogger('chat')

/** So oft darf ein Agent einen anderen anstoßen, bevor die Kette abbricht. */
const MAX_CHAIN_DEPTH = 3
/** Streaming-Takt: schneller als das brauchen weder Auge noch Renderer. */
const STREAM_INTERVAL_MS = 60

/** Laufende Chat-Läufe, adressiert über die Nachricht, in die sie schreiben. */
const activeRuns = new Map<string, RunHandle>()

// ---------------------------------------------------------------------------
// Senden
// ---------------------------------------------------------------------------

export interface SendInput {
  projectId: string
  content: string
  mentions?: string[]
  replyToId?: string | null
  attachmentIds?: string[]
}

/**
 * Speichert die Nachricht des Nutzers und stößt alle erwähnten Agenten an. Die Läufe
 * laufen im Hintergrund weiter — der Aufrufer bekommt sofort seine Nachricht zurück.
 */
export function send(input: SendInput): ChatMessage {
  const project = getProject(input.projectId)
  if (!project) throw new Error(mainT()('main.error.projectGone'))

  const agents = listProjectAgents(project.id)
  const mentioned = resolveMentions(agents, input.content, input.mentions)

  // Im Thread ist ohne Erwähnung klar, wer gemeint ist. Der getippte Text bleibt unangetastet —
  // der Agent landet nur in `mentions`, und `autoMention` sagt der Oberfläche, dass sie das
  // dezent anzeigen soll.
  const replyToId = input.replyToId ?? null
  let target: ThreadTarget | null = null
  if (mentioned.length === 0 && replyToId) {
    target = resolveThreadTarget(replyToId, agents)
    if (target?.kind === 'inProject') mentioned.push(target.agent)
  }

  const created = createMessage({
    projectId: project.id,
    role: 'user',
    content: input.content,
    mentions: mentioned.map((agent) => agent.id),
    replyToId,
    status: 'done',
    metadata: target?.kind === 'inProject' ? { autoMention: target.agent.id } : {},
  })
  if (input.attachmentIds?.length) attachToMessage(input.attachmentIds, created.id)

  const message = getMessage(created.id)!
  emitMessage(message, null)

  const stopped = mentioned.filter((agent) => agent.stopped)
  if (stopped.length > 0) {
    const names = stopped.map((agent) => agent.name).join(', ')
    systemMessage(
      project.id,
      mainT()('main.system.stopped', { count: stopped.length, names }),
      replyToId,
    )
  }

  // Eine Nachricht, auf die nichts folgt, darf nie unkommentiert bleiben — sonst sieht es aus,
  // als sei die App kaputt.
  if (mentioned.length === 0) {
    const removed = target?.kind === 'outsideProject' ? target.agent : null
    systemMessage(project.id, unansweredNote(agents, input.content, removed), replyToId)
  }

  const runnable = mentioned.filter((agent) => !agent.stopped)
  if (runnable.length > 0) {
    const visited = new Set<string>()
    void Promise.all(
      runnable.map((agent) =>
        runAgent({ project, agent, trigger: message, depth: 0, visited }).catch((error: unknown) => {
          log.warn('Agentenlauf beendet mit Fehler', {
            agentId: agent.id,
            ...describeError(error),
          })
        }),
      ),
    )
  }

  return message
}

/**
 * Warum auf diese Nachricht niemand antwortet. Die drei Fälle unterscheiden sich für den Nutzer
 * deutlich: kein Agent im Projekt, ein Agent erwähnt der nicht zum Projekt gehört, oder schlicht
 * keine Erwähnung im Text.
 */
function unansweredNote(
  agents: readonly ProjectAgent[],
  text: string,
  /** Im Thread ermittelter Agent, der inzwischen nicht mehr zum Projekt gehört. */
  removed: Agent | null = null,
): string {
  const t = mainT()
  if (agents.length === 0) return t('main.system.noAgents')

  const keys = agents.map((agent) => agent.mentionKey).join(', ')
  const outside = removed ? [removed] : mentionedOutsideProject(agents, listAgents(), text)
  if (outside.length > 0) {
    const named = outside.map((agent) => `${agent.mentionKey} (${agent.name})`).join(', ')
    return t('main.system.outsideProject', { named, keys })
  }

  return t('main.system.noMention', { keys })
}

// ---------------------------------------------------------------------------
// Ein Agentenlauf
// ---------------------------------------------------------------------------

export interface RunAgentOptions {
  project: Project
  agent: Agent
  /** Die Nachricht, auf die der Agent antwortet. */
  trigger: ChatMessage
  depth?: number
  /** Agenten, die in dieser Kette schon gelaufen sind — sie laufen kein zweites Mal. */
  visited?: Set<string>
  /** Vorhandene Nachricht überschreiben statt eine neue anzulegen (Wiederholen). */
  reuseMessageId?: string
}

export interface StartedRun {
  /** Die leere Antwortnachricht, die ab sofort im Verlauf steht. */
  message: ChatMessage
  /** Läuft weiter, auch wenn niemand wartet; wirft `RateLimitError` durch. */
  completed: Promise<ChatMessage>
}

/**
 * Legt die Antwortnachricht an und startet den Lauf. Getrennt von `runAgent`, weil das
 * Wiederholen die Nachricht sofort braucht, das Ergebnis aber nicht abwarten kann.
 */
export function startAgentRun(options: RunAgentOptions): StartedRun | null {
  const { project, agent, trigger } = options
  if (isStopped(project.id, agent.id)) {
    log.info('Lauf übersprungen, Agent ist gestoppt', { projectId: project.id, agentId: agent.id })
    return null
  }

  const visited = options.visited ?? new Set<string>()
  visited.add(agent.id)

  const metadata: JsonObject = { triggerMessageId: trigger.id, tools: [] }
  const message = options.reuseMessageId
    ? updateMessage(options.reuseMessageId, {
        content: '',
        thinking: null,
        status: 'streaming',
        errorCode: null,
        metadata,
      })
    : createMessage({
        projectId: project.id,
        role: 'agent',
        agentId: agent.id,
        content: '',
        status: 'streaming',
        // Antworten bleiben im Thread, in dem gefragt wurde.
        replyToId: trigger.replyToId ?? null,
        metadata,
      })

  emitMessage(message, null)
  return { message, completed: execute(options, message, visited) }
}

/** Bequemer Einstieg: startet den Lauf und liefert die fertige Nachricht. */
export async function runAgent(options: RunAgentOptions): Promise<ChatMessage | null> {
  const started = startAgentRun(options)
  return started ? started.completed : null
}

async function execute(
  options: RunAgentOptions,
  message: ChatMessage,
  visited: Set<string>,
): Promise<ChatMessage> {
  const { project, agent, trigger } = options
  const depth = options.depth ?? 0
  const scope = { projectId: project.id, agentId: agent.id }
  const warm = getSession(buildScopeKey(scope)) !== null
  const promptInput = { project, agent, trigger, task: buildTask(project.id, trigger) }
  const prompt = warm ? buildResume(promptInput) : buildFull(promptInput)

  const tools: string[] = []
  let text = ''
  let thinking = ''
  let flushed = ''
  let timer: NodeJS.Timeout | null = null

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (text === flushed) return
    const delta = text.startsWith(flushed) ? text.slice(flushed.length) : null
    flushed = text
    try {
      emitMessage(updateMessage(message.id, { content: text, thinking: thinking || null }), delta)
    } catch (error) {
      // Die Nachricht wurde mitten im Stream gelöscht — der Lauf endet gleich von selbst.
      log.debug('Zwischenstand konnte nicht gespeichert werden', describeError(error))
    }
  }

  const schedule = (): void => {
    if (timer) return
    timer = setTimeout(flush, STREAM_INTERVAL_MS)
  }

  emitStatus(project.id, agent.id, 'thinking', null, message.id)

  try {
    const result = await withRunContext(scope, async (context) => {
      const runHandle = startClaudeRun({
        prompt,
        cwd: project.path ?? '',
        model: agent.model,
        effort: agent.effort,
        scope,
        mcp: context.mcp,
        skills: listSkillsForAgent(agent.id),
        label: 'chat',
      })
      activeRuns.set(message.id, runHandle)

      runHandle.events.on('text', (full) => {
        text = full
        emitStatus(project.id, agent.id, 'writing', null, message.id)
        schedule()
      })
      runHandle.events.on('thinking', (full) => {
        thinking = full
        emitStatus(project.id, agent.id, 'thinking', null, message.id)
        schedule()
      })
      runHandle.events.on('toolStart', ({ name }) => {
        const label = toolLabel(name)
        tools.push(label)
        emitStatus(project.id, agent.id, 'tool', label, message.id)
      })
      runHandle.events.on('toolEnd', () => {
        emitStatus(project.id, agent.id, 'writing', null, message.id)
      })

      try {
        return await runHandle.done
      } finally {
        activeRuns.delete(message.id)
        runHandle.events.removeAll()
      }
    })

    if (timer) clearTimeout(timer)
    text = result.text
    thinking = result.thinking

    // Wurde die Nachricht während des Laufs gelöscht, gibt es nichts mehr zu schreiben.
    if (!getMessage(message.id)) return message

    if (result.aborted) {
      const stopped = updateMessage(message.id, {
        content: appendStopNote(text),
        thinking: thinking || null,
        status: 'stopped',
        errorCode: 'stopped',
        metadata: { triggerMessageId: trigger.id, tools },
      })
      emitMessage(stopped, null)
      emitStatus(project.id, agent.id, 'idle', null, null)
      return stopped
    }

    const done = updateMessage(message.id, {
      content: text.trim(),
      thinking: thinking || null,
      mentions: mentionedAgents(listProjectAgents(project.id), text).map((peer) => peer.id),
      status: 'done',
      errorCode: null,
      metadata: { triggerMessageId: trigger.id, tools },
    })
    emitMessage(done, null)
    emitStatus(project.id, agent.id, 'idle', null, null)
    notifyAgentDone(agent.name, done.content || mainT()('main.notify.doneFallback'))

    chain(options, done, depth, visited)
    return done
  } catch (error) {
    if (timer) clearTimeout(timer)
    activeRuns.delete(message.id)

    const failure = describeRunFailure(error)
    if (!getMessage(message.id)) {
      if (error instanceof RateLimitError) throw error
      return message
    }

    const failed = updateMessage(message.id, {
      content: text.trim(),
      thinking: thinking || null,
      status: 'error',
      errorCode: failure.code,
      metadata: { triggerMessageId: trigger.id, tools, error: failure.message },
    })
    emitMessage(failed, null)
    emitStatus(project.id, agent.id, 'error', failure.message, message.id)
    notifyError(mainT()('main.notify.failed', { name: agent.name }), failure.message)
    log.error('Agentenlauf fehlgeschlagen', {
      projectId: project.id,
      agentId: agent.id,
      code: failure.code,
      message: failure.message,
    })

    // Die Goal-Engine braucht das Rate-Limit als Fehler, nicht als Textmeldung.
    if (error instanceof RateLimitError) throw error
    return failed
  }
}

/** Der Auftrag, der am Ende des Prompts steht. */
function buildTask(projectId: string, trigger: ChatMessage): string {
  const author =
    trigger.role === 'user'
      ? 'Der Nutzer'
      : trigger.role === 'system'
        ? 'Das System'
        : (listProjectAgents(projectId).find((peer) => peer.id === trigger.agentId)?.name ??
          'Ein anderer Agent')

  return [
    `${author} hat dich in dieser Nachricht erwähnt:`,
    '',
    trigger.content.trim() || '(kein Text)',
    '',
    'Antworte darauf. Alles, was du an Tickets, Dokumenten oder Erinnerungen ändern willst,',
    'änderst du mit deinen Werkzeugen.',
  ].join('\n')
}

function appendStopNote(text: string): string {
  const note = mainT()('main.system.stoppedByUser')
  const trimmed = text.trim()
  return trimmed ? `${trimmed}\n\n${note}` : note
}

/**
 * Verkettung: Erwähnungen in der Antwort starten die genannten Agenten. Kein Textverständnis,
 * keine Heuristik — nur die Erwähnung zählt, und jeder Agent läuft je Kette höchstens einmal.
 */
function chain(
  options: RunAgentOptions,
  answer: ChatMessage,
  depth: number,
  visited: Set<string>,
): void {
  const { project, agent } = options
  const agents = listProjectAgents(project.id)
  const targets = mentionedAgents(agents, answer.content).filter(
    (peer) => peer.id !== agent.id && !visited.has(peer.id) && !peer.stopped,
  )
  if (targets.length === 0) return

  if (depth + 1 > MAX_CHAIN_DEPTH) {
    systemMessage(project.id, mainT()('main.system.chainLimit'), answer.replyToId)
    return
  }

  for (const target of targets) {
    void runAgent({
      project,
      agent: target,
      trigger: answer,
      depth: depth + 1,
      visited,
    }).catch((error: unknown) => {
      log.warn('Verketteter Lauf beendet mit Fehler', {
        agentId: target.id,
        ...describeError(error),
      })
    })
  }
}

// ---------------------------------------------------------------------------
// Stoppen, Wiederholen, Löschen
// ---------------------------------------------------------------------------

/** Beendet den Lauf, der in diese Nachricht schreibt. Verkettet wird danach nichts mehr. */
export function stopMessage(messageId: string): void {
  const active = activeRuns.get(messageId)
  if (active) {
    active.abort()
    return
  }

  const message = getMessage(messageId)
  if (!message || message.status !== 'streaming') return
  const stopped = updateMessage(messageId, {
    content: appendStopNote(message.content),
    status: 'stopped',
    errorCode: 'stopped',
  })
  emitMessage(stopped, null)
  if (message.agentId) emitStatus(message.projectId, message.agentId, 'idle', null, null)
}

/** Alle laufenden Läufe eines Agenten beenden — der Anschlusspunkt des Stopp-Schalters. */
export function stopAgentRuns(projectId: string, agentId: string): void {
  const killed = killByFilter(
    (info) => info.scope.projectId === projectId && info.scope.agentId === agentId,
  )
  if (killed > 0) log.info('Läufe eines Agenten beendet', { projectId, agentId, killed })
}

/** Verwirft die fehlgeschlagene Antwort und startet denselben Agenten noch einmal. */
export function retryMessage(messageId: string): ChatMessage {
  const message = getMessage(messageId)
  if (!message) throw new Error(mainT()('main.error.messageGone'))
  if (message.role !== 'agent' || !message.agentId) {
    throw new Error(mainT()('main.error.retryAgentOnly'))
  }
  if (activeRuns.has(messageId)) {
    throw new Error(mainT()('main.error.stillRunning'))
  }

  const project = getProject(message.projectId)
  if (!project) throw new Error(mainT()('main.error.projectGone'))

  const agent = listProjectAgents(project.id).find((candidate) => candidate.id === message.agentId)
  if (!agent) throw new Error(mainT()('main.error.agentLeftProject'))
  if (agent.stopped) throw new Error(`${agent.name} ist gestoppt.`)

  const triggerId = message.metadata.triggerMessageId
  const trigger =
    (typeof triggerId === 'string' ? getMessage(triggerId) : null) ??
    (message.replyToId ? getMessage(message.replyToId) : null)
  if (!trigger) throw new Error(mainT()('main.error.triggerGone'))

  const started = startAgentRun({
    project,
    agent,
    trigger,
    depth: 0,
    reuseMessageId: message.id,
  })
  if (!started) throw new Error(`${agent.name} ist gestoppt.`)

  started.completed.catch((error: unknown) => {
    log.warn('Wiederholter Lauf beendet mit Fehler', describeError(error))
  })
  return started.message
}

export function deleteMessage(messageId: string): void {
  activeRuns.get(messageId)?.abort()
  deleteMessageRow(messageId)
}

export interface ClearHistoryInput {
  projectId: string
  /** Ohne Angabe wird der gesamte Verlauf des Projekts gelöscht. */
  olderThanDays?: number | null
}

/** Der Zeitpunkt, vor dem gelöscht wird — `null`, wenn alles weg soll. */
function clearCutoff(olderThanDays: number | null | undefined): string | null {
  if (olderThanDays == null) return null
  return new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
}

/** Wie viele Nachrichten `clearHistory` mit denselben Angaben löschen würde. */
export function countHistory(input: ClearHistoryInput): { count: number } {
  return {
    count: countMessagesToClear({
      projectId: input.projectId,
      before: clearCutoff(input.olderThanDays),
    }),
  }
}

/**
 * Räumt den Chatverlauf eines Projekts weg. Mit den Nachrichten müssen zwei Dinge mit, die
 * sonst als Rest zurückblieben: die Anhangsdateien auf der Platte und die gespeicherten
 * CLI-Sessions — sonst setzte der nächste `--resume`-Lauf auf einem Transkript auf, dessen
 * sichtbarer Verlauf gerade verschwunden ist.
 */
export async function clearHistory(input: ClearHistoryInput): Promise<{ deleted: number }> {
  const result = clearProjectMessages({
    projectId: input.projectId,
    before: clearCutoff(input.olderThanDays),
  })

  if (result.deleted === 0) return { deleted: 0 }

  for (const messageId of result.messageIds) activeRuns.get(messageId)?.abort()
  deleteSessionsForProject(input.projectId)
  await removeAttachmentFolders(result.attachmentPaths)

  log.info('Chatverlauf bereinigt', {
    projectId: input.projectId,
    deleted: result.deleted,
    attachments: result.attachmentPaths.length,
  })

  emitEvent('chat.historyCleared', { projectId: input.projectId, deleted: result.deleted })
  return { deleted: result.deleted }
}

// ---------------------------------------------------------------------------
// Lesen und Anhänge
// ---------------------------------------------------------------------------

export function history(options: ListMessagesOptions): ChatMessage[] {
  return listMessages(options)
}

export function thread(messageId: string): ChatMessage[] {
  return listThread(messageId)
}

export interface SaveAttachmentInput {
  fileName: string
  mimeType?: string | null
  dataBase64: string
  messageId?: string | null
  ticketId?: string | null
}

/**
 * Legt die Datei unter `userData/attachments/<uuid>/<name>` ab. Der eigene Ordner je Anhang
 * verhindert, dass zwei gleichnamige Dateien einander überschreiben.
 */
export async function saveAttachment(input: SaveAttachmentInput): Promise<MessageAttachment> {
  const safeName = sanitizeFileName(input.fileName)
  const folder = randomUUID()
  const directory = path.join(getAttachmentsRoot(), folder)
  await mkdir(directory, { recursive: true })

  const data = Buffer.from(input.dataBase64, 'base64')
  await writeFile(path.join(directory, safeName), data)

  return createAttachment({
    messageId: input.messageId ?? null,
    ticketId: input.ticketId ?? null,
    fileName: input.fileName,
    mimeType: input.mimeType ?? null,
    relativePath: `${folder}/${safeName}`,
    size: data.byteLength,
  })
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\p{L}\p{N}._-]+/gu, '_')
  const trimmed = base.replace(/^\.+/, '').slice(0, 120)
  return trimmed || 'datei'
}

// ---------------------------------------------------------------------------
// Ereignisse
// ---------------------------------------------------------------------------

function emitMessage(message: ChatMessage, delta: string | null): void {
  emitEvent('chat.message', { projectId: message.projectId, message, delta })
}

function emitStatus(
  projectId: string,
  agentId: string,
  activity: AgentActivity,
  detail: string | null,
  messageId: string | null,
): void {
  emitEvent('chat.agentStatus', { projectId, agentId, activity, detail, messageId })
}

function systemMessage(projectId: string, content: string, replyToId: string | null): ChatMessage {
  const message = createMessage({
    projectId,
    role: 'system',
    content,
    replyToId,
    status: 'done',
  })
  emitMessage(message, null)
  return message
}
