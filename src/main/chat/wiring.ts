import { app } from 'electron'
import { registerAgentRunCanceller } from '../agents/runControl'
import { registerOneShotRunner } from '../agents/promptGeneration'
import { run } from '../claude'
import { deleteSession } from '../db/repositories/sessions'
import { stopAgentRuns } from './ChatService'

/**
 * Verbindet die Anschlusspunkte, die andere Module bewusst offen gelassen haben, mit dem
 * ClaudeRunner: den Stopp-Schalter der Agenten und den einmaligen Aufruf, aus dem die
 * Agenten-Oberfläche Systemprompts erzeugt.
 */
const PROMPT_SCOPE = { projectId: 'system', agentId: 'prompt-generator' }

export function initChatEngine(): void {
  registerAgentRunCanceller(stopAgentRuns)

  registerOneShotRunner(async ({ prompt, systemPrompt }) => {
    const handle = run({
      prompt,
      // Bewusste Ausnahme von der Regel „cwd = Projektpfad": die Prompt-Erzeugung gehört zu
      // keinem Projekt. Sie darf deshalb auch kein fremdes Repo als Arbeitsverzeichnis sehen.
      cwd: app.getPath('userData'),
      model: 'claude-sonnet-5',
      effort: 'medium',
      scope: PROMPT_SCOPE,
      systemPromptAppend: systemPrompt,
      label: 'one-shot',
    })
    try {
      const result = await handle.done
      return result.text
    } finally {
      // Eine Prompt-Erzeugung ist ein Einzelfall; ein warmes Transkript hilft ihr nicht.
      deleteSession(handle.scopeKey)
    }
  })
}
