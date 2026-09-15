import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { scopedLogger } from '../Logger'

const log = scopedLogger('claude.skills')

/**
 * Name des Plugins, unter dem die CLI die Skills führt — Claude ruft sie als
 * `agent-skills:<slug>` auf. Ohne `plugin.json` nähme die CLI den Ordnernamen, also die
 * Agenten-ID.
 */
const SKILL_PLUGIN_NAME = 'agent-skills'

const FINGERPRINT_FILE = '.fingerprint'
const SAFE_SEGMENT = /^[A-Za-z0-9-]+$/
const SAFE_SLUG = /^[a-z0-9-]+$/

export interface RunSkill {
  slug: string
  name: string
  description: string
  content: string
}

function agentSkillsRoot(): string {
  return join(app.getPath('userData'), 'agent-skills')
}

/**
 * Schreibt den Plugin-Ordner eines Agenten aus der Datenbank neu und liefert den Pfad für
 * `--plugin-dir` — oder `null`, wenn der Agent keine Skills hat.
 *
 * Aufbau (mit `claude -p --plugin-dir` 2.1.267 geprüft):
 * `.claude-plugin/plugin.json` und `skills/<slug>/SKILL.md`. Den Skill-Namen nimmt die CLI
 * vom Ordner, nicht aus dem Frontmatter; ohne `description` bietet sie ihn Claude nicht an.
 *
 * Der Ordner wird neben dem Ziel vollständig aufgebaut und dann eingetauscht, damit ein
 * zweiter Lauf desselben Agenten nie halb geschriebene Dateien sieht. Ist der Inhalt
 * unverändert, bleibt der vorhandene Ordner unangetastet.
 */
export function prepareSkillDirectory(agentId: string, skills: readonly RunSkill[]): string | null {
  if (!SAFE_SEGMENT.test(agentId)) throw new Error(`Ungültige Agenten-ID für Skills: ${agentId}`)

  const root = agentSkillsRoot()
  const target = join(root, agentId)
  const usable = skills.filter((skill) => {
    if (SAFE_SLUG.test(skill.slug)) return true
    log.warn('Skill mit ungültigem Slug übersprungen', { agentId, slug: skill.slug })
    return false
  })

  if (usable.length === 0) {
    rmSync(target, { recursive: true, force: true })
    return null
  }

  const fingerprint = createHash('sha256').update(JSON.stringify(usable)).digest('hex')
  if (readFingerprint(target) === fingerprint) return target

  mkdirSync(root, { recursive: true })
  const staging = join(root, `.${agentId}.${randomUUID()}`)
  try {
    writeTree(staging, usable, fingerprint)
    swapInto(root, agentId, staging)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  log.debug('Skill-Ordner geschrieben', { agentId, skills: usable.map((skill) => skill.slug) })
  return target
}

function readFingerprint(dir: string): string | null {
  try {
    return readFileSync(join(dir, FINGERPRINT_FILE), 'utf8')
  } catch {
    return null
  }
}

function writeTree(dir: string, skills: readonly RunSkill[], fingerprint: string): void {
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    `${JSON.stringify({ name: SKILL_PLUGIN_NAME, version: '1.0.0' }, null, 2)}\n`,
  )
  for (const skill of skills) {
    const skillDir = join(dir, 'skills', skill.slug)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), renderSkillFile(skill))
  }
  writeFileSync(join(dir, FINGERPRINT_FILE), fingerprint)
}

/**
 * JSON-Strings sind gültige YAML-Skalare in doppelten Anführungszeichen — so überstehen
 * Doppelpunkte, Rauten und Zeilenumbrüche in der Beschreibung das Frontmatter.
 */
function renderSkillFile(skill: RunSkill): string {
  const description = skill.description.trim() || skill.name.trim() || skill.slug
  return [
    '---',
    `name: ${skill.slug}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    skill.content.trim(),
    '',
  ].join('\n')
}

function swapInto(root: string, agentId: string, staging: string): void {
  const target = join(root, agentId)
  const retired = join(root, `.${agentId}.old.${randomUUID()}`)

  try {
    renameSync(target, retired)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }

  try {
    renameSync(staging, target)
  } catch (error) {
    // Ein paralleler Lauf hat gerade einen frischen Ordner eingetauscht — der genügt.
    const code = errorCode(error)
    if (code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error
  } finally {
    rmSync(retired, { recursive: true, force: true })
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code
}
