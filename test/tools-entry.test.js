import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'

import { apply, inject, name } from '../src/tools-entry.js'
import { readManagerState, writeManagerState } from '../src/state.js'
import { keyId } from '../src/lib.js'
import { makeCredentials, makeCtx } from './helpers.js'

const HOME = mkdtempSync(join(tmpdir(), 'dsh-exa-tools-entry-'))
process.env.DSH_HOME = HOME
after(() => rmSync(HOME, { recursive: true, force: true }))

const A = 'exa_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'exa_bbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const SEARCH_OK = {
  requestId: 'req_1',
  resolvedSearchType: 'auto',
  costDollars: { total: 0.005, search: { neural: 0.005 } },
  results: [
    {
      id: 'doc_1',
      title: 'Example paper',
      url: 'https://example.com/paper',
      author: 'Ada',
      publishedDate: '2026-01-02',
      score: 0.91,
      highlights: ['A useful passage.'],
      highlightScores: [0.88],
    },
  ],
}

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get() { return null } },
    async text() { return text },
  }
}

function exec() {
  return { signal: new AbortController().signal }
}

beforeEach(() => {
  writeManagerState({ strategy: 'priority' })
})

function mount({ keys = [A, B], strategy = 'priority' } = {}) {
  writeManagerState({ strategy })
  const credentials = makeCredentials({ refs: { EXA_API_KEYS: keys.join(',') } })
  const { ctx, tools, routes, sections, effects } = makeCtx({ credentials })
  apply(ctx)
  return { credentials, ctx, tools, routes, sections, effects }
}

function unmount(mounted) {
  for (const dispose of mounted.effects.reverse()) {
    if (typeof dispose === 'function') dispose()
  }
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

test('the tools entry owns only model-facing resources', () => {
  assert.equal(name, 'dsh-exa-tools')
  assert.deepEqual([...inject].sort(), ['credentials', 'systemPrompt', 'tools'])
})

test('tools entry registers exactly three tools and one prompt section, and no route', () => {
  const mounted = mount()
  assert.deepEqual([...mounted.tools.keys()].sort(), ['exa_fetch', 'exa_search', 'exa_search_advanced'])
  assert.deepEqual([...mounted.sections.keys()], ['tool:exa'])
  assert.equal(mounted.sections.get('tool:exa').order, 111)
  assert.equal(mounted.routes.size, 0)
  unmount(mounted)
  assert.equal(mounted.tools.size, 0)
  assert.equal(mounted.sections.size, 0)
  assert.equal(mounted.routes.size, 0)
})

test('tools entry can be mounted again after a clean unmount', () => {
  const first = mount()
  unmount(first)
  const second = mount()
  assert.equal(second.tools.size, 3)
  assert.equal(second.sections.size, 1)
  assert.equal(second.routes.size, 0)
  unmount(second)
})

test('two mounted tools entries keep independent round-robin cursors', async () => {
  const first = mount({ strategy: 'round-robin' })
  const second = mount({ strategy: 'round-robin' })
  const used = []

  await withFetch(async (url, init) => {
    used.push(init.headers.authorization.slice('Bearer '.length))
    return jsonResponse(SEARCH_OK)
  }, async () => {
    await first.tools.get('exa_search').execute({ query: 'first call' }, exec())
    await second.tools.get('exa_search').execute({ query: 'second call' }, exec())
    await first.tools.get('exa_search').execute({ query: 'third call' }, exec())
  })

  assert.deepEqual(used, [A, A, B])
  assert.equal(first.routes.size, 0)
  assert.equal(second.routes.size, 0)
  unmount(first)
  unmount(second)
})

test('a 402 in one mounted tools entry deactivates the shared key for the other', async () => {
  const first = mount()
  const second = mount()
  const used = []

  await withFetch(async (url, init) => {
    const key = init.headers.authorization.slice('Bearer '.length)
    used.push(key)
    if (key === A) return jsonResponse({ requestId: 'req_402', error: 'no credit' }, 402)
    return jsonResponse(SEARCH_OK)
  }, async () => {
    await first.tools.get('exa_search').execute({ query: 'spend' }, exec())
  })

  assert.deepEqual(used, [A, B])
  assert.equal(readManagerState().inactiveKeys[keyId(A)].reason, 'http_402')

  used.length = 0
  await withFetch(async (url, init) => {
    used.push(init.headers.authorization.slice('Bearer '.length))
    return jsonResponse(SEARCH_OK)
  }, async () => {
    const value = await second.tools.get('exa_search').execute({ query: 'after 402' }, exec())
    assert.equal(value.requestId, 'req_1')
  })

  assert.deepEqual(used, [B])
  unmount(first)
  unmount(second)
})

test('tools entry never registers a web route or a Client resource', async () => {
  const mounted = mount()
  assert.equal(mounted.routes.size, 0)
  unmount(mounted)
  assert.equal(mounted.routes.size, 0)
})
