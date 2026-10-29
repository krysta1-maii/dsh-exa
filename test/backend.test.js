import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, beforeEach, test } from 'node:test'

import { installBackend } from '../src/backend.js'
import { keyId } from '../src/lib.js'
import { readManagerState } from '../src/state.js'
import { callRoute, makeCredentials, makeCtx } from './helpers.js'

const A = 'exa_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'exa_bbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const C = 'exa_cccccccccccccccccccccccccccc'

let home = null

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-exa-backend-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (home !== null) rmSync(home, { recursive: true, force: true })
  home = null
})

after(() => {
  delete process.env.DSH_HOME
})

function setup({ refs = { EXA_API_KEYS: [A, B, C].join(',') }, writable = {} } = {}) {
  const credentials = makeCredentials({ refs, writable })
  const { ctx, routes } = makeCtx({ credentials })
  installBackend(ctx)
  return { credentials, routes }
}

async function manager(routes, method, url, body) {
  return callRoute(routes.get('/api/exa-manager').handler, method, url, body)
}

test('GET lists keys in stored order with masks, IDs, and permissions', async () => {
  const { routes } = setup()
  const res = await manager(routes, 'GET', '/api/exa-manager')
  assert.equal(res.status, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.body.ok, true)
  assert.equal(res.body.source, 'list')
  assert.deepEqual(res.body.keys.map((entry) => entry.masked), [A, B, C].map((value) => value.slice(0, 8) + '…' + value.slice(-4)))
  assert.equal(res.body.keys[0].primary, true)
  assert.equal(res.body.keys[0].id, keyId(A))
  assert.equal(res.body.writable.add, true)
  assert.equal(res.body.writable.edit, true)
  assert.equal(res.body.writable.service, undefined)
  assert.equal(res.body.serviceKey, undefined)
  assert.equal(routes.has('/api/exa-usage'), false)
  assert.equal(JSON.stringify(res.body).includes(A), false)
})

test('add accepts comma/newline batches, dedupes, syncs the primary, and records savedAt', async () => {
  const { routes, credentials } = setup()
  const res = await manager(routes, 'POST', '/api/exa-manager', {
    action: 'add',
    keys: [A + ',\n' + B, C],
  })
  assert.equal(res.status, 200)
  assert.equal(res.body.added, 0)
  assert.equal(credentials.store.get('EXA_API_KEYS'), [A, B, C].join(','))

  const res2 = await manager(routes, 'POST', '/api/exa-manager', {
    action: 'add',
    keys: ['  exa_dddddddddddddddddddddddddddd  , exa_eeeeeeeeeeeeeeeeeeeeeeeeeeee '],
  })
  assert.equal(res2.status, 200)
  assert.equal(res2.body.added, 2)
  assert.equal(credentials.store.get('EXA_API_KEYS').split(',').length, 5)
  assert.equal(credentials.store.get('EXA_API_KEY'), A)
  assert.equal(typeof res2.body.keys[3].savedAt, 'string')
  const mode = statSync(join(home, 'exa-manager.json')).mode & 0o777
  assert.equal(mode, 0o600)
})

test('reveal returns one full key on demand with no-store', async () => {
  const { routes } = setup()
  const res = await manager(routes, 'GET', '/api/exa-manager?reveal=' + encodeURIComponent(keyId(B)))
  assert.equal(res.status, 200)
  assert.equal(res.body.value, B)
  assert.equal(res.headers['cache-control'], 'no-store')
  const missing = await manager(routes, 'GET', '/api/exa-manager?reveal=' + encodeURIComponent(keyId('exa_ffffffffffffffffffffffffffff')))
  assert.equal(missing.status, 404)
  assert.equal(missing.body.code, 'key_not_found')
})

test('replace keeps the position and rejects duplicates', async () => {
  const { routes, credentials } = setup()
  const replacement = 'exa_ffffffffffffffffffffffffffff'
  const res = await manager(routes, 'POST', '/api/exa-manager', { action: 'replace', id: keyId(B), value: replacement })
  assert.equal(res.status, 200)
  assert.deepEqual(credentials.store.get('EXA_API_KEYS').split(','), [A, replacement, C])
  assert.equal(res.body.keys[1].masked, replacement.slice(0, 8) + '…' + replacement.slice(-4))
  const dup = await manager(routes, 'POST', '/api/exa-manager', { action: 'replace', id: keyId(A), value: replacement })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.code, 'duplicate_key')
})

test('remove keeps the remaining order and clears the derived primary when emptied', async () => {
  const { routes, credentials } = setup()
  const res = await manager(routes, 'POST', '/api/exa-manager', { action: 'remove', ids: [keyId(A)] })
  assert.equal(res.status, 200)
  assert.equal(credentials.store.get('EXA_API_KEYS'), [B, C].join(','))
  assert.equal(credentials.store.get('EXA_API_KEY'), B)

  await manager(routes, 'POST', '/api/exa-manager', { action: 'remove', ids: [keyId(B), keyId(C)] })
  assert.equal(credentials.store.has('EXA_API_KEYS'), false)
  assert.equal(credentials.store.has('EXA_API_KEY'), false)
  assert.equal(readManagerState().keySavedAt[keyId(B)], undefined)
})

test('reorder requires the complete current set exactly once', async () => {
  const { routes, credentials } = setup()
  const order = [keyId(C), keyId(A), keyId(B)]
  const res = await manager(routes, 'POST', '/api/exa-manager', { action: 'reorder', ids: order })
  assert.equal(res.status, 200)
  assert.equal(credentials.store.get('EXA_API_KEYS'), [C, A, B].join(','))
  assert.equal(credentials.store.get('EXA_API_KEY'), C)

  const bad = await manager(routes, 'POST', '/api/exa-manager', { action: 'reorder', ids: [keyId(C), keyId(A)] })
  assert.equal(bad.status, 409)
  assert.equal(bad.body.code, 'invalid_order')
  assert.equal(credentials.store.get('EXA_API_KEYS'), [C, A, B].join(','))
})

test('strategy persists without changing key order', async () => {
  const { routes, credentials } = setup()
  const before = credentials.store.get('EXA_API_KEYS')
  const res = await manager(routes, 'POST', '/api/exa-manager', { action: 'setStrategy', strategy: 'round-robin' })
  assert.equal(res.status, 200)
  assert.equal(res.body.strategy, 'round-robin')
  assert.equal(credentials.store.get('EXA_API_KEYS'), before)
  assert.equal(readManagerState().strategy, 'round-robin')
})

test('read-only EXA_API_KEYS rejects every key mutation and reports the state', async () => {
  const { routes, credentials } = setup({ writable: { EXA_API_KEYS: false, EXA_API_KEY: false } })
  const get = await manager(routes, 'GET', '/api/exa-manager')
  assert.equal(get.body.writable.edit, false)
  assert.equal(get.body.writable.add, false)
  for (const body of [
    { action: 'add', keys: ['exa_ffffffffffffffffffffffffffff'] },
    { action: 'reorder', ids: [keyId(C), keyId(A), keyId(B)] },
    { action: 'remove', ids: [keyId(A)] },
    { action: 'replace', id: keyId(A), value: 'exa_ffffffffffffffffffffffffffff' },
  ]) {
    const res = await manager(routes, 'POST', '/api/exa-manager', body)
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'readonly_keys')
  }
  assert.equal(credentials.store.get('EXA_API_KEYS'), [A, B, C].join(','))
})

test('deleting the last list key is refused when an inherited primary would resurrect it', async () => {
  const { routes } = setup({
    refs: { EXA_API_KEYS: A, EXA_API_KEY: A },
    writable: { EXA_API_KEY: false },
  })
  const res = await manager(routes, 'POST', '/api/exa-manager', { action: 'remove', ids: [keyId(A)] })
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'readonly_primary')
})

test('unknown manager actions and methods are rejected without leaking keys', async () => {
  const { routes } = setup()
  const unknown = await manager(routes, 'POST', '/api/exa-manager', { action: 'nope' })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.body.code, 'invalid_action')
  const method = await manager(routes, 'DELETE', '/api/exa-manager')
  assert.equal(method.status, 405)
  assert.equal(method.body.code, 'method_not_allowed')
})
