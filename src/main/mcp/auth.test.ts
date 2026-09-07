import assert from 'node:assert/strict'
import test from 'node:test'
import { authorize, extractBearerToken } from './auth'
import { activeTokenCount, register, release, releaseAll, resolve } from './RunContextRegistry'

const context = { projectId: 'p1', agentId: 'a1', goalId: 7, ticketId: 't1' }

test('liest gültige Bearer-Header', () => {
  assert.equal(extractBearerToken('Bearer abc123'), 'abc123')
  assert.equal(extractBearerToken('bearer abc123'), 'abc123')
  assert.equal(extractBearerToken('  Bearer\tabc123  '), 'abc123')
  assert.equal(extractBearerToken(['Bearer abc123']), 'abc123')
})

test('weist fehlende und unbrauchbare Header ab', () => {
  assert.equal(extractBearerToken(undefined), null)
  assert.equal(extractBearerToken(null), null)
  assert.equal(extractBearerToken(''), null)
  assert.equal(extractBearerToken('abc123'), null)
  assert.equal(extractBearerToken('Basic abc123'), null)
  assert.equal(extractBearerToken('Bearer'), null)
  assert.equal(extractBearerToken('Bearer '), null)
  assert.equal(extractBearerToken('Bearer a b'), null)
  assert.equal(extractBearerToken('BearerToken abc123'), null)
})

test('Anfrage ohne Token bekommt keinen Kontext', () => {
  releaseAll()
  register(context)
  assert.equal(authorize(undefined), null)
  assert.equal(authorize(''), null)
  assert.equal(authorize('Bearer'), null)
  releaseAll()
})

test('Anfrage mit unbekanntem Token bekommt keinen Kontext', () => {
  releaseAll()
  const token = register(context)
  assert.equal(authorize(`Bearer ${token}x`), null)
  assert.equal(authorize('Bearer 00000000000000000000000000000000'), null)
  releaseAll()
})

test('gültiges Token löst den Kontext auf', () => {
  releaseAll()
  const token = register(context)
  assert.deepEqual(authorize(`Bearer ${token}`), context)
  assert.deepEqual(resolve(token), context)
  releaseAll()
})

test('Token nach release ist ungültig', () => {
  releaseAll()
  const token = register(context)
  release(token)
  assert.equal(authorize(`Bearer ${token}`), null)
  assert.equal(resolve(token), null)
  assert.equal(activeTokenCount(), 0)
})

test('Tokens sind lang, zufällig und je Lauf verschieden', () => {
  releaseAll()
  const tokens = new Set<string>()
  for (let index = 0; index < 200; index += 1) {
    const token = register(context)
    assert.match(token, /^[0-9a-f]{64}$/)
    tokens.add(token)
  }
  assert.equal(tokens.size, 200)
  releaseAll()
})

test('ein Token gehört genau einem Lauf — Freigabe trifft keinen anderen', () => {
  releaseAll()
  const first = register({ projectId: 'p1', agentId: 'a1' })
  const second = register({ projectId: 'p2', agentId: 'a2' })
  release(first)
  assert.equal(authorize(`Bearer ${first}`), null)
  assert.deepEqual(authorize(`Bearer ${second}`), { projectId: 'p2', agentId: 'a2' })
  releaseAll()
})
