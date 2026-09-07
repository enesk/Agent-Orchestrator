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

const META_PROMPT = `Du schreibst Systemprompts für KI-Agenten, die in einer lokalen
Entwicklungs-App an echten Code-Repositories arbeiten. Antworte ausschließlich mit einem
JSON-Objekt der Form {"title": string, "systemPrompt": string} — kein Fließtext, keine
Code-Zäune. "title" ist eine kurze deutsche Rollenbezeichnung (höchstens vier Wörter).
"systemPrompt" ist ein deutscher Systemprompt in zweiter Person, 120 bis 250 Wörter, der
Aufgabe, Arbeitsweise, Grenzen und Tonfall des Agenten beschreibt. Erfinde keine Werkzeuge
und keine Namen von Kolleginnen oder Kollegen.`

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

/** Nimmt auch Antworten an, die das JSON in Code-Zäune oder Fließtext einbetten. */
function parseAnswer(answer: string, request: PromptGenerationRequest): PromptGenerationResult {
  const text = answer.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1))
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        const systemPrompt = typeof record.systemPrompt === 'string' ? record.systemPrompt.trim() : ''
        const title = typeof record.title === 'string' ? record.title.trim() : ''
        if (systemPrompt) {
          return { systemPrompt, title: title || null }
        }
      }
    } catch {
      // Fällt unten auf den Rohtext zurück.
    }
  }

  if (!text) {
    throw new Error(`Claude hat keinen Systemprompt für "${request.description}" geliefert.`)
  }
  return { systemPrompt: text, title: null }
}
