import { DEFAULT_AGENT_MODEL, type AgentEffort } from '@shared/constants'
import { listProjectAgents } from '../db/repositories/agents'
import * as agents from '../agents/AgentService'
import type { TranslationKey } from '@shared/i18n'
import { mainT } from '../app/settings'
import { scopedLogger } from '../Logger'
import type { ProjectAgent } from '@shared/types'

const log = scopedLogger('goals.agents')

export interface DefaultAgentTemplate {
  /** Anzeigename und Titel entstehen erst beim Anlegen — in der Sprache, die dann eingestellt ist. */
  nameKey: TranslationKey
  titleKey: TranslationKey
  systemPrompt: string
  model: string
  effort: AgentEffort
}

/**
 * Vorlagen für die Rollen, die ein Vorhaben zwingend braucht. Aufgelöst wird immer über die
 * Rolle — die Namen hier sind reine Anzeigetexte und stehen nirgends im Ablauf.
 */
export const DEFAULT_AGENT_TEMPLATES: Record<'planner' | 'pm' | 'reviewer', DefaultAgentTemplate> = {
  planner: {
    nameKey: 'main.agent.default.planner.name',
    titleKey: 'main.agent.default.planner.title',
    systemPrompt: `Du planst Software-Vorhaben in einem lokalen Code-Repository.

Aus einer Beschreibung machst du ein Pflichtenheft, das ein anderer Agent ohne Rückfragen
umsetzen kann. Du liest dafür zuerst den vorhandenen Code, damit der Ist-Zustand stimmt und
keine erfundenen Dateien, Bibliotheken oder Konventionen darin stehen.

Du schreibst nüchtern und in kurzen Sätzen. Anforderungen sind prüfbar formuliert und
durchnummeriert. Was du nicht sicher weißt, kommt als offene Frage ans Ende, statt geraten zu
werden. Du änderst keinen Code und legst keine Tickets an.`,
    model: DEFAULT_AGENT_MODEL,
    effort: 'high',
  },
  pm: {
    nameKey: 'main.agent.default.pm.name',
    titleKey: 'main.agent.default.pm.title',
    systemPrompt: `Du zerlegst ein Pflichtenheft in Tickets für ein lokales Code-Repository.

Jedes Ticket ist ein abgeschlossenes Arbeitspaket: eine Person kann es in einem Zug erledigen,
ohne auf ein anderes offenes Ticket zu warten. Jedes Ticket nennt die betroffenen Dateien oder
Bereiche und hat Akzeptanzkriterien, an denen sich prüfen lässt, ob es fertig ist.

Du schneidest lieber wenige, tragfähige Tickets als viele winzige. Du änderst keinen Code und
legst Tickets ausschließlich über das Werkzeug an.`,
    model: DEFAULT_AGENT_MODEL,
    effort: 'high',
  },
  reviewer: {
    nameKey: 'main.agent.default.reviewer.name',
    titleKey: 'main.agent.default.reviewer.title',
    systemPrompt: `Du prüfst die Arbeit anderer Agenten in einem lokalen Code-Repository.

Du glaubst keiner Statusmeldung, sondern schaust in den Code: Ist umgesetzt, was das
Pflichtenheft verlangt? Halten die Akzeptanzkriterien der Tickets? Gibt es Platzhalter, leere
Funktionsrümpfe oder Reste, die nichts tun?

Du führst keine Test-Suites und keine vollständigen Builds aus. Du änderst selbst keinen Code.
Du benennst Mängel konkret mit Datei und Stelle und meldest das Ergebnis ausschließlich über
das dafür vorgesehene Werkzeug.`,
    model: DEFAULT_AGENT_MODEL,
    effort: 'high',
  },
}

/**
 * Der Agent, der diese Rolle im Projekt ausfüllt. Fehlt er, entsteht er aus der Vorlage und
 * wird dem Projekt zugeordnet — für die Rolle `worker` gibt es bewusst keine Vorlage.
 */
export function ensureRoleAgent(projectId: string, role: 'planner' | 'pm' | 'reviewer'): ProjectAgent {
  const existing = agents.ensureRole(projectId, role)
  if (existing) return existing

  const template = DEFAULT_AGENT_TEMPLATES[role]
  const t = mainT()
  const created = agents.create({
    name: t(template.nameKey),
    title: t(template.titleKey),
    role,
    systemPrompt: template.systemPrompt,
    model: template.model,
    effort: template.effort,
  })
  log.info('Standard-Agent für Rolle angelegt', { projectId, role, agentId: created.id })
  return agents.addToProject(projectId, created.id)
}

/**
 * Alle für das Vorhaben freigegebenen Umsetzer — auch gestoppte. Der WorkerPool braucht diese
 * Menge, um zu wissen, wann wirklich jeder Agent ein Ticket einmal in der Hand hatte.
 */
export function resolveWorkerCandidates(
  projectId: string,
  selectedAgentIds: readonly string[],
): ProjectAgent[] {
  const all = listProjectAgents(projectId).filter((agent) => agent.role === 'worker')
  const selected = selectedAgentIds.length > 0
    ? all.filter((agent) => selectedAgentIds.includes(agent.id))
    : all
  return selected.length > 0 ? selected : all
}

/** Die Umsetzer des Vorhabens: Rolle `worker`, nicht gestoppt, ggf. auf die Auswahl begrenzt. */
export function resolveWorkers(projectId: string, selectedAgentIds: readonly string[]): ProjectAgent[] {
  return resolveWorkerCandidates(projectId, selectedAgentIds).filter((agent) => !agent.stopped)
}

/** Meldung, wenn kein Umsetzer bereitsteht — die Engine legt für diese Rolle nichts an. */
export function missingWorkerMessage(projectId: string): string {
  const any = listProjectAgents(projectId).some((agent) => agent.role === 'worker')
  return any ? mainT()('main.goal.workersStopped') : mainT()('main.goal.workersMissing')
}
