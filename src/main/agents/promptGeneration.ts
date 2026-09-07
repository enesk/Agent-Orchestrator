import { AGENT_ROLES, type AgentRole } from '@shared/constants'

/**
 * Erzeugt aus einer Kurzbeschreibung einen deutschen Systemprompt. Der eigentliche
 * Claude-Aufruf gehört dem ClaudeRunner — es gibt genau eine Stelle, die die CLI startet.
 * Deshalb wird hier nur ein Ausführer angemeldet; solange keiner da ist, schlägt die
 * Erzeugung mit einer sprechenden Meldung fehl.
 */

export interface PromptGenerationRequest {
  description: string
  name?: string
  role?: AgentRole
}

export interface PromptGenerationResult {
  systemPrompt: string
  title: string | null
}

/** Führt einen einmaligen Claude-Aufruf aus und liefert die reine Textantwort. */
export type OneShotClaudeRunner = (input: {
  prompt: string
  systemPrompt: string
}) => Promise<string>

let runner: OneShotClaudeRunner | null = null

export function registerOneShotRunner(fn: OneShotClaudeRunner): () => void {
  runner = fn
  return () => {
    if (runner === fn) runner = null
  }
}

export function isPromptGenerationAvailable(): boolean {
  return runner !== null
}

const TITLE_MARKER = 'TITEL:'
const PROMPT_MARKER = 'PROMPT:'

/**
 * Bewusst kein JSON: Modelle schreiben in deutschen Texten typografische und gerade
 * Anführungszeichen durcheinander, und ein einziges unmaskiertes `"` machte die Antwort
 * unlesbar — dann landete der Rohtext im Feld des Nutzers.
 */
const META_PROMPT = `Du schreibst Systemprompts für KI-Agenten, die in einer lokalen
Entwicklungs-App an echten Code-Repositories arbeiten.

Antworte in genau diesem Format, ohne Einleitung, ohne Code-Zäune:

${TITLE_MARKER} <kurze deutsche Rollenbezeichnung, höchstens vier Wörter>
${PROMPT_MARKER}
<der Systemprompt>

Der Systemprompt ist deutsch, in zweiter Person, 120 bis 250 Wörter, und beschreibt Aufgabe,
Arbeitsweise, Grenzen und Tonfall des Agenten. Erfinde keine Werkzeuge und keine Namen von
Kolleginnen oder Kollegen.`

export async function generateAgentPrompt(
  request: PromptGenerationRequest,
): Promise<PromptGenerationResult> {
  if (!runner) {
    throw new Error(
      'Die Claude-Anbindung ist noch nicht bereit — der Systemprompt kann gerade nicht erzeugt werden.',
    )
  }

  const answer = await runner({ prompt: buildUserPrompt(request), systemPrompt: META_PROMPT })
  return parseAnswer(answer, request)
}

function buildUserPrompt(request: PromptGenerationRequest): string {
  const lines = [`Beschreibung: ${request.description.trim()}`]
  if (request.name) lines.push(`Name des Agenten: ${request.name}`)
  if (request.role) {
    const role = AGENT_ROLES.find((option) => option.value === request.role)
    lines.push(`Rolle: ${role ? `${role.label} — ${role.description}` : request.role}`)
  }
  return lines.join('\n')
}

/**
 * Nimmt das erwartete Format an, notfalls auch das frühere JSON und im letzten Schritt den
 * Rohtext — ein Systemprompt ist besser als eine Fehlermeldung.
 */
function parseAnswer(answer: string, request: PromptGenerationRequest): PromptGenerationResult {
  const text = answer.trim()

  const marked = parseMarked(text)
  if (marked) return marked

  const json = parseJson(text)
  if (json) return json

  if (!text) {
    throw new Error(`Claude hat keinen Systemprompt für "${request.description}" geliefert.`)
  }
  return { systemPrompt: text, title: null }
}

/** Das vorgegebene Format: eine Titelzeile, danach alles ab `PROMPT:`. */
function parseMarked(text: string): PromptGenerationResult | null {
  const promptAt = text.indexOf(PROMPT_MARKER)
  if (promptAt === -1) return null

  const systemPrompt = text.slice(promptAt + PROMPT_MARKER.length).trim()
  if (!systemPrompt) return null

  const head = text.slice(0, promptAt)
  const titleAt = head.indexOf(TITLE_MARKER)
  const title =
    titleAt === -1
      ? ''
      : head
          .slice(titleAt + TITLE_MARKER.length)
          .split('\n')[0]!
          .trim()

  return { systemPrompt, title: title || null }
}

/** Ältere Antworten kamen als JSON-Objekt; das bleibt gültig, solange es sich lesen lässt. */
function parseJson(text: string): PromptGenerationResult | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const record = parsed as Record<string, unknown>
  const systemPrompt = typeof record.systemPrompt === 'string' ? record.systemPrompt.trim() : ''
  if (!systemPrompt) return null
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  return { systemPrompt, title: title || null }
}
