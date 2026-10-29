import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, beforeEach, test } from 'node:test'

import { installBackend } from '../src/backend.js'
import { keyId } from '../src/lib.js'
import { readManagerState, writeManagerState } from '../src/state.js'
import { callRoute, fakeResponse, makeCredentials, makeCtx } from './helpers.js'

const A = 'exa_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'exa_bbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const C = 'exa_cccccccccccccccccccccccccccc'
const S = 'exa_service_aaaaaaaaaaaaaaaaaaaaaaaa'

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

async function usage(routes, url) {
  return callRoute(routes.get('/api/exa-usage').handler, 'GET', url)
}

function adminCalls() {
  const calls = []
  const fetch = async (url, init = {}) => {
    const parsed = new URL(String(url))
    calls.push({ url: parsed.toString(), headers: init.headers })
    if (parsed.pathname.endsWith('/team-management/api-keys')) {
      return fakeResponse({
        apiKeys: [
          { id: 'team_1', name: 'Production', rateLimit: 10, budgetCents: 1000, isOverBudget: false },
          { id: 'team_2', name: 'Research', rateLimit: null, budgetCents: null, isOverBudget: true },
        ],
      })
    }
    const match = /\/api-keys\/([^/]+)\/usage$/u.exec(parsed.pathname)
    if (match !== null) {
      if (match[1] === 'team_1') {
        return fakeResponse({
          id: 'team_1',
          api_key_id: 'team_1',
          api_key_name: 'Production',
          period: { start: '2026-09-29T00:00:00Z', end: '2026-10-29T23:59:59Z' },
          total_cost_usd: 12.34,
          cost_breakdown: [
            { price_id: 'neural', price_name: 'Neural Search', quantity: 100, amount_usd: 10 },
            { price_id: 'contents', price_name: 'Contents', quantity: 20, amount_usd: 2.34 },
          ],
        })
      }
      return fakeResponse({
        api_key_id: 'team_2',
        api_key_name: 'Research',
        period: { start: '2026-09-29T00:00:00Z', end: '2026-10-29T23:59:59Z' },
        total_cost_usd: 0,
        cost_breakdown: [],
      })
    }
    return fakeResponse({ error: 'unexpected path' }, 404)
  }
  return { fetch, calls }
}

async function withFetch(stub, run) {
  const original = globalThis.fetch
  globalThis.fetch = stub
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
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

test('strategy and admin association persist without changing key order', async () => {
  const { routes, credentials } = setup()
  const before = credentials.store.get('EXA_API_KEYS')
  const res = await manager(routes, 'POST', '/api/exa-manager', { action: 'setStrategy', strategy: 'round-robin' })
  assert.equal(res.status, 200)
  assert.equal(res.body.strategy, 'round-robin')
  assert.equal(credentials.store.get('EXA_API_KEYS'), before)

  const linked = await manager(routes, 'POST', '/api/exa-manager', { action: 'setAdminKeyId', id: keyId(A), adminKeyId: 'team_1' })
  assert.equal(linked.status, 200)
  assert.equal(linked.body.keys[0].adminKeyId, 'team_1')
  assert.equal(readManagerState().strategy, 'round-robin')
  assert.equal(readManagerState().adminKeyIds[keyId(A)], 'team_1')
})

test('service key can be set, revealed, replaced, and removed', async () => {
  const { routes, credentials } = setup()
  const set = await manager(routes, 'POST', '/api/exa-manager', { action: 'setServiceKey', value: S })
  assert.equal(set.status, 200)
  assert.equal(credentials.store.get('EXA_SERVICE_API_KEY'), S)
  assert.equal(set.body.serviceKey.configured, true)
  assert.equal(JSON.stringify(set.body).includes(S), false)

  const reveal = await manager(routes, 'GET', '/api/exa-manager?revealService=1')
  assert.equal(reveal.status, 200)
  assert.equal(reveal.body.value, S)

  const removed = await manager(routes, 'POST', '/api/exa-manager', { action: 'removeServiceKey' })
  assert.equal(removed.status, 200)
  assert.equal(credentials.store.has('EXA_SERVICE_API_KEY'), false)
  assert.equal(removed.body.serviceKey.configured, false)
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

test('read-only service key rejects service changes', async () => {
  const { routes } = setup({ refs: { EXA_API_KEYS: A, EXA_SERVICE_API_KEY: S }, writable: { EXA_SERVICE_API_KEY: false } })
  const set = await manager(routes, 'POST', '/api/exa-manager', { action: 'setServiceKey', value: S })
  assert.equal(set.status, 409)
  assert.equal(set.body.code, 'readonly_service')
  const remove = await manager(routes, 'POST', '/api/exa-manager', { action: 'removeServiceKey' })
  assert.equal(remove.status, 409)
  assert.equal(remove.body.code, 'readonly_service')
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

test('usage without a service key degrades to an explicit configured:false payload', async () => {
  const { routes } = setup({ refs: { EXA_API_KEYS: A } })
  const res = await usage(routes, '/api/exa-usage')
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.configured, false)
  assert.deepEqual(res.body.rows, [])
})

test('usage lists team keys and maps associated local keys to budgets and breakdowns', async () => {
  const { routes } = setup({ refs: { EXA_API_KEYS: [A, B].join(','), EXA_SERVICE_API_KEY: S } })
  await manager(routes, 'POST', '/api/exa-manager', { action: 'setAdminKeyId', id: keyId(A), adminKeyId: 'team_1' })
  await manager(routes, 'POST', '/api/exa-manager', { action: 'setAdminKeyId', id: keyId(B), adminKeyId: 'team_2' })
  const admin = adminCalls()
  const res = await withFetch(admin.fetch, () => usage(routes, '/api/exa-usage?start_date=2026-09-29&end_date=2026-10-29'))
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.configured, true)
  assert.equal(res.body.range.startDate, '2026-09-29')
  assert.equal(res.body.teamKeys.length, 2)
  assert.equal(res.body.rows.length, 2)
  assert.equal(res.body.rows[0].ok, true)
  assert.equal(res.body.rows[0].name, 'Production')
  assert.equal(res.body.rows[0].budgetCents, 1000)
  assert.equal(res.body.rows[0].totalCostUsd, 12.34)
  assert.equal(res.body.rows[0].costBreakdown.length, 2)
  assert.equal(res.body.rows[1].ok, true)
  assert.equal(res.body.rows[1].budgetCents, null)
  assert.equal(res.body.rows[1].totalCostUsd, 0)
  assert.equal(res.body.totalCostUsd, 12.34)
  assert.equal(JSON.stringify(res.body).includes(A), false)
  assert.equal(JSON.stringify(res.body).includes(B), false)
})

test('usage caches by key and range and refresh bypasses the cache', async () => {
  const { routes } = setup({ refs: { EXA_API_KEYS: A, EXA_SERVICE_API_KEY: S } })
  await manager(routes, 'POST', '/api/exa-manager', { action: 'setAdminKeyId', id: keyId(A), adminKeyId: 'team_1' })
  const admin = adminCalls()
  await withFetch(admin.fetch, async () => {
    await usage(routes, '/api/exa-usage?start_date=2026-09-29&end_date=2026-10-29')
    await usage(routes, '/api/exa-usage?start_date=2026-09-29&end_date=2026-10-29')
    assert.equal(admin.calls.length, 2)
    await usage(routes, '/api/exa-usage?start_date=2026-09-29&end_date=2026-10-29&refresh=1')
    assert.equal(admin.calls.length, 4)
    await usage(routes, '/api/exa-usage?start_date=2026-09-01&end_date=2026-09-30')
    assert.equal(admin.calls.length, 5)
  })
})

test('a per-key usage failure affects only that row', async () => {
  const { routes } = setup({ refs: { EXA_API_KEYS: [A, B].join(','), EXA_SERVICE_API_KEY: S } })
  await manager(routes, 'POST', '/api/exa-manager', { action: 'setAdminKeyId', id: keyId(A), adminKeyId: 'team_1' })
  await manager(routes, 'POST', '/api/exa-manager', { action: 'setAdminKeyId', id: keyId(B), adminKeyId: 'team_2' })
  const original = adminCalls()
  const fetch = async (url, init) => {
    const parsed = new URL(String(url))
    if (parsed.pathname.endsWith('/team-management/api-keys')) return original.fetch(url, init)
    if (parsed.pathname.includes('/team_1/usage')) return fakeResponse({ error: 'usage exploded' }, 500)
    return original.fetch(url, init)
  }
  const res = await withFetch(fetch, () => usage(routes, '/api/exa-usage'))
  assert.equal(res.status, 200)
  assert.equal(res.body.rows[0].ok, false)
  assert.equal(res.body.rows[0].code, 'admin_error')
  assert.equal(res.body.rows[1].ok, true)
})

test('an unlinked key is reported per row and can be linked later', async () => {
  const { routes } = setup({ refs: { EXA_API_KEYS: A, EXA_SERVICE_API_KEY: S } })
  const admin = adminCalls()
  const first = await withFetch(admin.fetch, () => usage(routes, '/api/exa-usage'))
  assert.equal(first.body.rows[0].code, 'unlinked')
  await manager(routes, 'POST', '/api/exa-manager', { action: 'setAdminKeyId', id: keyId(A), adminKeyId: 'team_1' })
  const second = await withFetch(admin.fetch, () => usage(routes, '/api/exa-usage'))
  assert.equal(second.body.rows[0].ok, true)
})

test('an Admin 401 is surfaced as admin_unauthorized without affecting key management', async () => {
  const { routes } = setup({ refs: { EXA_API_KEYS: A, EXA_SERVICE_API_KEY: S } })
  const admin = adminCalls()
  const fetch = async (url) => {
    if (String(url).includes('/api-keys')) return fakeResponse({ error: 'Unauthorized' }, 401)
    return admin.fetch(url)
  }
  const res = await withFetch(fetch, () => usage(routes, '/api/exa-usage'))
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, false)
  assert.equal(res.body.code, 'admin_unauthorized')
  const get = await manager(routes, 'GET', '/api/exa-manager')
  assert.equal(get.status, 200)
})

test('invalid usage ranges are rejected with 400', async () => {
  const { routes } = setup({ refs: { EXA_API_KEYS: A, EXA_SERVICE_API_KEY: S } })
  const reversed = await usage(routes, '/api/exa-usage?start_date=2026-10-29&end_date=2026-10-01')
  assert.equal(reversed.status, 400)
  assert.equal(reversed.body.code, 'range_reversed')
  const old = await usage(routes, '/api/exa-usage?start_date=2020-01-01&end_date=2026-10-29')
  assert.equal(old.status, 400)
  assert.equal(old.body.code, 'range_too_old')
  const malformed = await usage(routes, '/api/exa-usage?start_date=nope')
  assert.equal(malformed.status, 400)
  assert.equal(malformed.body.code, 'invalid_range')
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
