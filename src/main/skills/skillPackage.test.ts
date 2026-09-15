import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  normalizeRelPath,
  parseSkillUpload,
  resolveSkillFilePath,
  SKILL_FILE_MAX_BYTES,
  SKILL_MAX_FILES,
  SkillImportError,
} from './skillPackage'
import { writeZip, type ZipWriteEntry } from './zip'

const SKILL_MD = Buffer.from('---\nname: Design\ndescription: Nutzen bei Seiten-Layouts\n---\n\nSiehe references/pages.md\n')
const root = path.resolve('/tmp/userData/skill-files/abc')

function zip(entries: ZipWriteEntry[]): Buffer {
  return writeZip(entries)
}

function rejects(run: () => unknown, key: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof SkillImportError, `SkillImportError erwartet, bekam ${String(error)}`)
    assert.equal(error.key, key)
    return true
  })
}

test('Zip-Slip: ../-Eintrag bricht den ganzen Import ab', () => {
  const archive = zip([
    { path: 'skill.md', data: SKILL_MD },
    { path: '../../../.ssh/authorized_keys', data: Buffer.from('ssh-ed25519 AAAA') },
  ])
  rejects(() => parseSkillUpload('evil.zip', archive), 'main.skillImport.unsafePath')
})

test('Zip-Slip: versteckt im Pfad, mit Backslash und absolut', () => {
  for (const evil of ['references/../../x.md', 'references\\..\\..\\x.md', '/etc/passwd', 'C:/Windows/x']) {
    const archive = zip([
      { path: 'SKILL.md', data: SKILL_MD },
      { path: evil, data: Buffer.from('x') },
    ])
    rejects(() => parseSkillUpload('evil.zip', archive), 'main.skillImport.unsafePath')
  }
})

test('Zip-Slip: ../-Eintrag bricht auch ab, wenn er ein Verzeichnis oder Symlink wäre', () => {
  const archive = zip([
    { path: 'SKILL.md', data: SKILL_MD },
    { path: '../outside/', data: Buffer.alloc(0), mode: 0o040755 },
  ])
  rejects(() => parseSkillUpload('evil.zip', archive), 'main.skillImport.unsafePath')
})

test('resolveSkillFilePath hält jeden Pfad im Skill-Ordner', () => {
  assert.equal(resolveSkillFilePath(root, 'references/pages.md'), path.join(root, 'references/pages.md'))
  assert.equal(resolveSkillFilePath(root, '../abc-evil/x.md'), null)
  assert.equal(resolveSkillFilePath(root, '../../x.md'), null)
  assert.equal(resolveSkillFilePath(root, 'a/../../x.md'), null)
  assert.equal(resolveSkillFilePath(root, '/etc/passwd'), null)
  assert.equal(resolveSkillFilePath(root, ''), null)
  assert.equal(resolveSkillFilePath(root, '.'), null)
  assert.equal(resolveSkillFilePath(root, 'x\0.md'), null)
  // Ein Dateiname, der nur mit zwei Punkten beginnt, bricht nicht aus.
  assert.equal(resolveSkillFilePath(root, '..notes.md'), path.join(root, '..notes.md'))
})

test('normalizeRelPath lehnt Ausbrüche, versteckte Pfade und eine zweite SKILL.md ab', () => {
  assert.equal(normalizeRelPath('references/Pages.md'), 'references/Pages.md')
  assert.equal(normalizeRelPath('assets\\token.css'), 'assets/token.css')
  assert.equal(normalizeRelPath('../x.md'), null)
  assert.equal(normalizeRelPath('a/./b.md'), null)
  assert.equal(normalizeRelPath('.git/config'), null)
  assert.equal(normalizeRelPath('skill.md'), null)
  assert.equal(normalizeRelPath('C:/x.md'), null)
})

test('Symlinks im Archiv werden übersprungen, nicht übernommen', () => {
  const archive = zip([
    { path: 'SKILL.md', data: SKILL_MD },
    { path: 'references/pages.md', data: Buffer.from('# Seiten') },
    { path: 'references/keys', data: Buffer.from('/Users/enes/.ssh/id_ed25519'), mode: 0o120777 },
  ])
  const skill = parseSkillUpload('design.zip', archive)
  assert.deepEqual(skill.files.map((file) => file.relPath), ['references/pages.md'])
})

test('Grenze je Datei: 5 MB', () => {
  const archive = zip([
    { path: 'SKILL.md', data: SKILL_MD },
    { path: 'assets/big.bin', data: Buffer.alloc(SKILL_FILE_MAX_BYTES + 1, 1) },
  ])
  rejects(() => parseSkillUpload('big.zip', archive), 'main.skillImport.fileTooLarge')
})

test('Grenze je Skill: 20 MB entpackt', () => {
  const chunk = Buffer.alloc(SKILL_FILE_MAX_BYTES - 1024, 7)
  const archive = zip([
    { path: 'SKILL.md', data: SKILL_MD },
    ...[1, 2, 3, 4, 5].map((n) => ({ path: `assets/part${n}.bin`, data: chunk })),
  ])
  rejects(() => parseSkillUpload('total.zip', archive), 'main.skillImport.totalTooLarge')
})

test('Grenze: höchstens 100 Dateien', () => {
  const entries: ZipWriteEntry[] = [{ path: 'SKILL.md', data: SKILL_MD }]
  for (let i = 0; i < SKILL_MAX_FILES; i += 1) {
    entries.push({ path: `references/f${i}.md`, data: Buffer.from(`# ${i}`) })
  }
  rejects(() => parseSkillUpload('many.zip', zip(entries)), 'main.skillImport.tooManyFiles')
})

test('Zip-Bombe mit gelogener Größe bricht beim Entpacken an der Grenze ab', () => {
  // 200 MB Nullen komprimieren auf wenige hundert KB; das Verzeichnis gibt 10 Bytes an.
  const bomb = Buffer.alloc(200 * 1024 * 1024)
  const archive = zip([
    { path: 'SKILL.md', data: SKILL_MD },
    { path: 'references/bomb.md', data: bomb, declaredSize: 10 },
  ])
  assert.ok(archive.length < 1024 * 1024)
  const before = process.memoryUsage().arrayBuffers
  rejects(() => parseSkillUpload('bomb.zip', archive), 'main.skillImport.fileTooLarge')
  // Hätte der Leser alles entpackt, lägen jetzt 200 MB zusätzlich im Speicher.
  assert.ok(process.memoryUsage().arrayBuffers - before < 64 * 1024 * 1024)
})

test('Nutzerfall: skill.md klein, Beidateien mit Pfad und Schreibweise unverändert', () => {
  const archive = zip([
    { path: 'design-system/', data: Buffer.alloc(0), mode: 0o040755 },
    { path: 'design-system/skill.md', data: SKILL_MD },
    { path: 'design-system/references/pages.md', data: Buffer.from('# Seiten') },
    { path: 'design-system/references/Components.md', data: Buffer.from('# Komponenten') },
    { path: 'design-system/assets/token.css', data: Buffer.from(':root{}') },
    { path: 'design-system/.DS_Store', data: Buffer.from('x') },
    { path: '__MACOSX/design-system/._skill.md', data: Buffer.from('x') },
    { path: 'design-system/references/empty.md', data: Buffer.alloc(0) },
  ])
  const skill = parseSkillUpload('Design.zip', archive)
  assert.equal(skill.name, 'Design')
  assert.equal(skill.slugSource, 'design-system')
  assert.equal(skill.description, 'Nutzen bei Seiten-Layouts')
  assert.equal(skill.content, 'Siehe references/pages.md')
  assert.deepEqual(
    skill.files.map((file) => file.relPath),
    ['references/pages.md', 'references/Components.md', 'assets/token.css'],
  )
})

test('Archiv ohne oder mit mehreren SKILL.md wird abgelehnt', () => {
  rejects(
    () => parseSkillUpload('none.zip', zip([{ path: 'readme.md', data: SKILL_MD }])),
    'main.skillImport.noSkillFile',
  )
  rejects(
    () =>
      parseSkillUpload(
        'two.zip',
        zip([
          { path: 'a/SKILL.md', data: SKILL_MD },
          { path: 'b/Skill.md', data: SKILL_MD },
        ]),
      ),
    'main.skillImport.multipleSkillFiles',
  )
})

test('Dateien außerhalb des SKILL.md-Ordners und doppelte Schreibweisen werden abgelehnt', () => {
  rejects(
    () =>
      parseSkillUpload(
        'x.zip',
        zip([
          { path: 'skill/SKILL.md', data: SKILL_MD },
          { path: 'README.md', data: Buffer.from('x') },
        ]),
      ),
    'main.skillImport.outsideSkillDir',
  )
  rejects(
    () =>
      parseSkillUpload(
        'x.zip',
        zip([
          { path: 'SKILL.md', data: SKILL_MD },
          { path: 'references/a.md', data: Buffer.from('x') },
          { path: 'references/A.md', data: Buffer.from('y') },
        ]),
      ),
    'main.skillImport.duplicatePath',
  )
})

test('Markdown ohne description wird abgelehnt', () => {
  rejects(
    () => parseSkillUpload('x.md', Buffer.from('---\nname: X\n---\nRumpf')),
    'main.skillImport.descriptionMissing',
  )
  rejects(() => parseSkillUpload('x.md', Buffer.from('Nur Rumpf')), 'main.skillImport.descriptionMissing')
})

test('Frontmatter: gequotet, Block-Skalar, Slug aus Dateiname', () => {
  const quoted = parseSkillUpload(
    'Release Notes.md',
    Buffer.from('---\nname: "Rel: \\"A\\""\ndescription: >\n  Zeile eins\n  Zeile zwei\n---\nText'),
  )
  assert.equal(quoted.name, 'Rel: "A"')
  assert.equal(quoted.description, 'Zeile eins Zeile zwei')
  assert.equal(quoted.slugSource, 'Release Notes')

  const main = parseSkillUpload('SKILL.md', Buffer.from("---\nname: 'It''s'\ndescription: x # c\n---\n"))
  assert.equal(main.name, "It's")
  assert.equal(main.description, 'x')
  assert.equal(main.slugSource, "It's")
})
