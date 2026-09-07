import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { resolveAttachmentPath } from './attachment-path'

const root = path.resolve('/tmp/userData/attachments')

test('lässt Dateien innerhalb des Wurzelverzeichnisses durch', () => {
  assert.equal(resolveAttachmentPath(root, 'a/b/bild.png'), path.join(root, 'a/b/bild.png'))
  assert.equal(resolveAttachmentPath(root, '/bild.png'), path.join(root, 'bild.png'))
})

test('dekodiert prozentkodierte Namen', () => {
  assert.equal(resolveAttachmentPath(root, 'ein%20bild.png'), path.join(root, 'ein bild.png'))
})

test('weist Traversal ab', () => {
  assert.equal(resolveAttachmentPath(root, '../geheim.txt'), null)
  assert.equal(resolveAttachmentPath(root, 'a/../../geheim.txt'), null)
  assert.equal(resolveAttachmentPath(root, '..%2F..%2Fetc%2Fpasswd'), null)
  assert.equal(resolveAttachmentPath(root, '/etc/passwd'), path.join(root, 'etc/passwd'))
})

test('weist Geschwisterordner mit gleichem Präfix ab', () => {
  // `startsWith(root)` würde hier fälschlich durchlassen.
  assert.equal(resolveAttachmentPath(root, '../attachments-evil/beute.txt'), null)
})

test('weist Wurzelverzeichnis, leere und ungültige Eingaben ab', () => {
  assert.equal(resolveAttachmentPath(root, ''), null)
  assert.equal(resolveAttachmentPath(root, '/'), null)
  assert.equal(resolveAttachmentPath(root, 'datei\0.png'), null)
  assert.equal(resolveAttachmentPath(root, '%E0%A4%A'), null)
})
