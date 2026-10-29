import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ExaApiError } from '../src/exa-client.js'
import { adminErrorCode, createUsageClient, normalizeTeamKeys, normalizeUsage } from '../src/usage.js'

const S1 = 'exa_service_one'
const S2 = 'exa_service_two'

function response(body, status = 200) {
  const text = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get() { return null } },
    async text() { return text },
  }
}

test('normalizeTeamKeys accepts list and single-key response shapes', () => {
  assert.deepEqual(normalizeTeamKeys({
    apiKeys: [
      { id: 'a', name: 'A', rateLimit: 3, budgetCents: 100, isOverBudget: false },
      { id: 'b', name: null, rateLimit: null, budgetCents: null, isOverBudget: true },
    ],
  }), [
    { id: 'a', name: 'A', rateLimit: 3, budgetCents: 100, isOverBudget: false },
    { id: 'b', name: null, rateLimit: null, budgetCents: null, isOverBudget: true },
  ])
  assert.equal(normalizeTeamKeys({ apiKey: { id: 'a', name: 'A' } }).length, 1)
  assert.deepEqual(normalizeTeamKeys({ apiKeys: [{ name: 'no id' }] }), [])
})

test('normalizeUsage handles zero usage and cost breakdowns', () => {
  assert.deepEqual(normalizeUsage({
    api_key_id: 'a',
    api_key_name: 'A',
    total_cost_usd: 12.5,
    cost_breakdown: [{ price_id: 'p', price_name: 'Price', quantity: 2, amount_usd: 12.5 }],
    period: { start: 's', end: 'e' },
  }), {
    adminKeyId: 'a',
    apiKeyName: 'A',
    totalCostUsd: 12.5,
    costBreakdown: [{ priceId: 'p', priceName: 'Price', quantity: 2, amountUsd: 12.5 }],
    period: { start: 's', end: 'e' },
  })
  assert.equal(normalizeUsage({ total_cost_usd: 0 }).totalCostUsd, 0)
  assert.deepEqual(normalizeUsage({ total_cost_usd: 0 }).costBreakdown, [])
})

test('adminErrorCode maps statuses to stable public codes', () => {
  assert.equal(adminErrorCode(new ExaApiError('x', { status: 401 })), 'admin_unauthorized')
  assert.equal(adminErrorCode(new ExaApiError('x', { status: 403 })), 'admin_forbidden')
  assert.equal(adminErrorCode(new ExaApiError('x', { status: 404 })), 'admin_not_found')
  assert.equal(adminErrorCode(new ExaApiError('x', { status: 400 })), 'invalid_range')
  assert.equal(adminErrorCode(new ExaApiError('x', { status: 500 })), 'admin_error')
  assert.equal(adminErrorCode(new ExaApiError('x', { code: 'network' })), 'admin_unreachable')
  assert.equal(adminErrorCode(new Error('x')), 'admin_error')
})

test('usage cache is isolated by service key and range and can be cleared', async () => {
  let clock = 0
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return response({
      apiKeys: [{ id: 'team_1', name: 'One', budgetCents: 100, isOverBudget: false }],
      api_key_id: 'team_1',
      total_cost_usd: 1,
      cost_breakdown: [],
    })
  }
  try {
    const client = createUsageClient({ ttlMs: 1000, now: () => clock })
    await client.getTeamKeys(S1)
    await client.getTeamKeys(S1)
    assert.equal(calls.length, 1)
    clock = 1001
    await client.getTeamKeys(S1)
    assert.equal(calls.length, 2)
    await client.getTeamKeys(S2)
    assert.equal(calls.length, 3)

    const rangeA = { startDate: '2026-09-01', endDate: '2026-09-30' }
    const rangeB = { startDate: '2026-10-01', endDate: '2026-10-29' }
    await client.getUsage(S1, 'team_1', rangeA)
    await client.getUsage(S1, 'team_1', rangeA)
    assert.equal(calls.length, 4)
    await client.getUsage(S1, 'team_1', rangeB)
    assert.equal(calls.length, 5)
    await client.getUsage(S1, 'team_1', rangeB, { refresh: true })
    assert.equal(calls.length, 6)
    client.clear()
    await client.getUsage(S1, 'team_1', rangeB)
    assert.equal(calls.length, 7)
  } finally {
    globalThis.fetch = original
  }
})

test('in-flight usage queries are merged', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    await gate
    return response({ apiKeys: [{ id: 'team_1', name: 'One' }] })
  }
  let released = false
  const releaseOnce = () => {
    if (!released) {
      released = true
      release()
    }
  }
  try {
    const client = createUsageClient()
    const first = client.getTeamKeys(S1)
    const second = client.getTeamKeys(S1)
    await Promise.resolve()
    assert.equal(calls.length, 1)
    releaseOnce()
    const [a, b] = await Promise.all([first, second])
    assert.deepEqual(a, b)
  } finally {
    releaseOnce()
    globalThis.fetch = original
  }
})
