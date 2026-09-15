import { mkdirSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { resolveSkillFilePath } from './skillPackage'

const SAFE_SKILL_ID = /^[A-Za-z0-9-]+$/

/** `userData/skill-files` — hier liegen die Beidateien, getrennt vom Plugin-Ordner der Agenten. */
export function skillFilesRoot(): string {
  return path.join(app.getPath('userData'), 'skill-files')
}

export function skillFilesDir(skillId: string): string {
  if (!SAFE_SKILL_ID.test(skillId)) throw new Error(`Ungültige Skill-ID: ${skillId}`)
  return path.join(skillFilesRoot(), skillId)
}

/** Absoluter Pfad einer Beidatei — wirft, wenn der Pfad aus dem Skill-Ordner führt. */
export function skillFilePath(skillId: string, relPath: string): string {
  const resolved = resolveSkillFilePath(skillFilesDir(skillId), relPath)
  if (!resolved) throw new Error(`Pfad verlässt den Skill-Ordner: ${relPath}`)
  return resolved
}

/**
 * Schreibt neue Dateien. `wx` scheitert an allem, was schon da ist — auch an einem Symlink,
 * über den sonst außerhalb des Ordners geschrieben würde.
 */
export function writeSkillFiles(
  skillId: string,
  files: readonly { relPath: string; data: Buffer }[],
): void {
  for (const file of files) {
    const target = skillFilePath(skillId, file.relPath)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, file.data, { flag: 'wx' })
  }
}

/** Entfernt eine Datei und danach leer gewordene Unterordner bis zum Skill-Ordner. */
export function removeSkillFileFromDisk(skillId: string, relPath: string): void {
  const dir = skillFilesDir(skillId)
  const target = skillFilePath(skillId, relPath)
  rmSync(target, { force: true })

  // `target` ist geprüft, jeder Elternordner bis `dir` liegt also ebenfalls darin.
  let parent = path.dirname(target)
  while (parent !== dir) {
    try {
      if (readdirSync(parent).length > 0) break
      rmdirSync(parent)
    } catch {
      break
    }
    parent = path.dirname(parent)
  }
}

export function removeSkillFilesDir(skillId: string): void {
  rmSync(skillFilesDir(skillId), { recursive: true, force: true })
}
