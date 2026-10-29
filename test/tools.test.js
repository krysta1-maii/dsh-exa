import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

import { installTools } from '../src/tools.js'
import { writeManagerState } from '../src/state.js'
import { makeCredentials, makeCtx } from './helpers.js'

const HOME = mkdtempSync(join(tmpdir(), 'dsh-exa-tools-'))
process.env.DSH_HOME = HOME
after(() => rmSync(HOME, { recursive: true, force: true }))

const A = 'exa_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'exa_bbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const C = 'exa_cccccccccccccccccccccccccccc'

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

function install(keys = [A, B], strategy = 'priority') {
  writeManagerState({ strategy })
  const credentials = makeCredentials({ refs: { EXA_API_KEYS: keys.join(',') } })
  const { ctx, tools, sections } = makeCtx({ credentials })
  const dispose = installTools(ctx)
  return { credentials, ctx, tools, sections, dispose }
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

function assertSchema(definition, value) {
  const violations = validateJsonSchemaValue(definition.output.schema, value, 'value')
  assert.deepEqual(violations, [])
}

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
  notices: [{ code: 'RESTRICTIONS_RELAXED', path: '/query', message: 'Some restrictions were relaxed.' }],
}

test('installTools registers exactly three tools and one prompt section', () => {
  const { tools, sections, dispose } = install()
  assert.deepEqual([...tools.keys()].sort(), ['exa_fetch', 'exa_search', 'exa_search_advanced'])
  assert.deepEqual([...sections.keys()], ['tool:exa'])
  assert.equal(tools.get('exa_search').timeoutMs, 30000)
  assert.equal(tools.get('exa_search_advanced').timeoutMs, 60000)
  assert.equal(tools.get('exa_fetch').timeoutMs, 60000)
  dispose()
  assert.equal(tools.size, 0)
  assert.equal(sections.size, 0)
  dispose()
  assert.equal(tools.size, 0)
})

test('exa_search sends the fixed auto+highlights body and validates its output', async () => {
  const { tools } = install([A])
  const calls = []
  const result = await withFetch(async (url, init) => {
    calls.push({ url: String(url), init })
    return jsonResponse(SEARCH_OK)
  }, async () => tools.get('exa_search').execute({ query: '  a semantic query  ', numResults: 3 }, exec()))

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.exa.ai/search')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.authorization, 'Bearer ' + A)
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    query: 'a semantic query',
    type: 'auto',
    numResults: 3,
    contents: { highlights: true },
  })
  assert.equal(result.results[0].url, 'https://example.com/paper')
  assert.equal(result.requestId, 'req_1')
  assert.equal(result.notices[0].code, 'RESTRICTIONS_RELAXED')
  assertSchema(tools.get('exa_search'), result)
  const rendered = tools.get('exa_search').output.render({}, result)
  assert.match(rendered[0].text, /https:\/\/example\.com\/paper/u)
  assert.match(rendered[0].text, /A useful passage/u)
})

test('401, 402, and 429 fail over in list order; each key is tried once', async () => {
  const { tools } = install([A, B, C])
  const seen = []
  const result = await withFetch(async (url, init) => {
    seen.push(init.headers.authorization)
    if (seen.length === 1) return jsonResponse({ requestId: 'r1', error: 'bad key', tag: 'INVALID_API_KEY' }, 401)
    if (seen.length === 2) return jsonResponse({ requestId: 'r2', error: 'budget', tag: 'BUDGET_EXCEEDED' }, 402)
    return jsonResponse(SEARCH_OK)
  }, async () => tools.get('exa_search').execute({ query: 'q' }, exec()))

  assert.deepEqual(seen, ['Bearer ' + A, 'Bearer ' + B, 'Bearer ' + C])
  assert.equal(result.results.length, 1)
})

test('429 also fails over without changing the request body', async () => {
  const { tools } = install([A, B])
  const bodies = []
  await withFetch(async (url, init) => {
    bodies.push(init.body)
    if (bodies.length === 1) return jsonResponse({ requestId: 'r1', error: 'rate', tag: 'RATE_LIMIT' }, 429)
    return jsonResponse(SEARCH_OK)
  }, async () => tools.get('exa_search').execute({ query: 'q' }, exec()))
  assert.equal(bodies[0], bodies[1])
})

test('non-retryable 400 fails immediately and preserves requestId/tag', async () => {
  const { tools } = install([A, B])
  let calls = 0
  await assert.rejects(
    () => withFetch(async () => {
      calls += 1
      return jsonResponse({ requestId: 'bad_req', error: 'invalid parameter', tag: 'INVALID_ARGUMENT' }, 400)
    }, async () => tools.get('exa_search').execute({ query: 'q' }, exec())),
    (error) => {
      assert.match(error.message, /HTTP 400/u)
      assert.match(error.message, /bad_req/u)
      assert.match(error.message, /INVALID_ARGUMENT/u)
      assert.equal(error.message.includes(A), false)
      return true
    },
  )
  assert.equal(calls, 1)
})

test('all retryable failures produce one aggregate error with the last diagnostics', async () => {
  const { tools } = install([A, B])
  let calls = 0
  await assert.rejects(
    () => withFetch(async () => {
      calls += 1
      return jsonResponse({ requestId: 'last_' + calls, error: 'quota', tag: 'QUOTA' }, 402)
    }, async () => tools.get('exa_search').execute({ query: 'q' }, exec())),
    (error) => {
      assert.match(error.message, /all 2 configured key/u)
      assert.match(error.message, /last_2/u)
      assert.match(error.message, /QUOTA/u)
      assert.equal(error.message.includes(A), false)
      assert.equal(error.message.includes(B), false)
      return true
    },
  )
  assert.equal(calls, 2)
})

test('network failure does not fail over', async () => {
  const { tools } = install([A, B])
  let calls = 0
  await assert.rejects(
    () => withFetch(async () => {
      calls += 1
      throw new TypeError('socket closed')
    }, async () => tools.get('exa_search').execute({ query: 'q' }, exec())),
    /network error: socket closed/u,
  )
  assert.equal(calls, 1)
})

test('abort failures do not fail over', async () => {
  const { tools } = install([A, B])
  let calls = 0
  await assert.rejects(
    () => withFetch(async () => {
      calls += 1
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }, async () => tools.get('exa_search').execute({ query: 'q' }, exec())),
    /cancelled/u,
  )
  assert.equal(calls, 1)
})

test('priority mode always starts at the first key', async () => {
  const { tools } = install([A, B])
  const seen = []
  await withFetch(async (url, init) => {
    seen.push(init.headers.authorization)
    return jsonResponse(SEARCH_OK)
  }, async () => {
    await tools.get('exa_search').execute({ query: 'one' }, exec())
    await tools.get('exa_search').execute({ query: 'two' }, exec())
  })
  assert.deepEqual(seen, ['Bearer ' + A, 'Bearer ' + A])
})

test('round-robin snapshots the cursor and rotates the starting key', async () => {
  const { tools } = install([A, B, C], 'round-robin')
  const seen = []
  await withFetch(async (url, init) => {
    seen.push(init.headers.authorization)
    return jsonResponse(SEARCH_OK)
  }, async () => {
    await tools.get('exa_search').execute({ query: 'one' }, exec())
    await tools.get('exa_search').execute({ query: 'two' }, exec())
    await tools.get('exa_search').execute({ query: 'three' }, exec())
    await tools.get('exa_search').execute({ query: 'four' }, exec())
  })
  assert.deepEqual(seen, ['Bearer ' + A, 'Bearer ' + B, 'Bearer ' + C, 'Bearer ' + A])
})

test('round-robin failover continues from the selected start and wraps', async () => {
  const { tools } = install([A, B, C], 'round-robin')
  const seen = []
  await withFetch(async (url, init) => {
    seen.push(init.headers.authorization)
    if (seen.length === 1) return jsonResponse({ requestId: 'r', error: 'x', tag: 'X' }, 401)
    return jsonResponse(SEARCH_OK)
  }, async () => tools.get('exa_search').execute({ query: 'one' }, exec()))
  assert.deepEqual(seen, ['Bearer ' + A, 'Bearer ' + B])
})

test('advanced search maps nested contents and keeps bounded output', async () => {
  const { tools } = install([A])
  let captured = null
  const response = {
    requestId: 'adv_1',
    resolvedSearchType: 'auto',
    costDollars: { total: 0.02, contents: { text: 0.01, highlights: 0.01 } },
    context: 'a context string',
    results: [{
      id: 'd1',
      title: 'Advanced',
      url: 'https://example.com/adv',
      author: 'Author',
      publishedDate: '2026-02-01',
      score: 0.7,
      highlights: ['h'],
      summary: 's',
      text: 'full text',
      subpages: [{ title: 'Sub', url: 'https://example.com/sub' }],
    }],
    notices: [{ code: 'N', path: '/query', message: 'notice' }],
  }
  const result = await withFetch(async (url, init) => {
    captured = JSON.parse(init.body)
    return jsonResponse(response)
  }, async () => tools.get('exa_search_advanced').execute({
    query: 'q',
    numResults: 7,
    type: 'auto',
    category: 'research paper',
    includeDomains: ['example.com'],
    excludeDomains: ['bad.example'],
    startPublishedDate: '2026-01-01',
    endPublishedDate: '2026-03-01',
    userLocation: 'US',
    moderation: true,
    textMaxCharacters: 1200,
    contextMaxCharacters: 900,
    enableSummary: true,
    summaryQuery: 'summarize',
    enableHighlights: true,
    highlightsMaxCharacters: 500,
    highlightsQuery: 'find',
    maxAgeHours: 24,
    livecrawlTimeout: 5000,
    subpages: 2,
    subpageTarget: ['docs'],
  }, exec()))

  assert.deepEqual(captured, {
    query: 'q',
    type: 'auto',
    numResults: 7,
    category: 'research paper',
    includeDomains: ['example.com'],
    excludeDomains: ['bad.example'],
    startPublishedDate: '2026-01-01',
    endPublishedDate: '2026-03-01',
    userLocation: 'US',
    moderation: true,
    contents: {
      highlights: { maxCharacters: 500, query: 'find' },
      text: { maxCharacters: 1200 },
      context: { maxCharacters: 900 },
      summary: { query: 'summarize' },
      maxAgeHours: 24,
      livecrawlTimeout: 5000,
      subpages: 2,
      subpageTarget: ['docs'],
    },
  })
  assert.equal(result.context, 'a context string')
  assert.equal(result.results[0].text, 'full text')
  assert.equal(result.results[0].subpages[0].url, 'https://example.com/sub')
  assertSchema(tools.get('exa_search_advanced'), result)
})

test('advanced search rejects lite with unsupported parameters before any request', async () => {
  const { tools } = install([A])
  let calls = 0
  await assert.rejects(
    () => withFetch(async () => {
      calls += 1
      return jsonResponse(SEARCH_OK)
    }, async () => tools.get('exa_search_advanced').execute({ query: 'q', type: 'lite', maxAgeHours: 1 }, exec())),
    /lite does not support: maxAgeHours/u,
  )
  await assert.rejects(
    () => tools.get('exa_search_advanced').execute({ query: 'q', type: 'lite', summaryQuery: 'x', enableSummary: true }, exec()),
    /lite does not support: enableSummary, summaryQuery/u,
  )
  assert.equal(calls, 0)
})

test('lite still accepts text and highlights', async () => {
  const { tools } = install([A])
  let captured = null
  await withFetch(async (url, init) => {
    captured = JSON.parse(init.body)
    return jsonResponse(SEARCH_OK)
  }, async () => tools.get('exa_search_advanced').execute({
    query: 'q',
    type: 'lite',
    textMaxCharacters: 100,
    highlightsMaxCharacters: 50,
  }, exec()))
  assert.deepEqual(captured.contents, {
    highlights: { maxCharacters: 50 },
    text: { maxCharacters: 100 },
  })
})

test('advanced search validates paired dates and pairing rules', async () => {
  const { tools } = install([A])
  await assert.rejects(
    () => tools.get('exa_search_advanced').execute({ query: 'q', startPublishedDate: '2026-02-01', endPublishedDate: '2026-01-01' }, exec()),
    /must not be after/u,
  )
  await assert.rejects(
    () => tools.get('exa_search_advanced').execute({ query: 'q', summaryQuery: 'x' }, exec()),
    /requires enableSummary/u,
  )
  await assert.rejects(
    () => tools.get('exa_search_advanced').execute({ query: 'q', subpageTarget: 'docs' }, exec()),
    /requires subpages/u,
  )
  await assert.rejects(
    () => tools.get('exa_search_advanced').execute({ query: 'q', category: 'people', excludeDomains: ['x.test'] }, exec()),
    /does not support excludeDomains/u,
  )
})

test('exa_fetch maps urls and maxCharacters, preserving statuses', async () => {
  const { tools } = install([A])
  let captured = null
  const response = {
    requestId: 'fetch_1',
    costDollars: { total: 0.002, contents: { text: 0.002 } },
    results: [{
      id: 'https://example.com',
      title: 'Example',
      url: 'https://example.com',
      author: 'A',
      publishedDate: '2026-01-01',
      text: 'page text',
      statusCode: 200,
    }],
    statuses: [
      { id: 'https://example.com', status: 'success', source: 'crawled' },
      { id: 'https://bad.example', status: 'error', error: { tag: 'FETCH_FAILED', httpStatusCode: 404 } },
    ],
  }
  const result = await withFetch(async (url, init) => {
    captured = JSON.parse(init.body)
    return jsonResponse(response)
  }, async () => tools.get('exa_fetch').execute({ urls: ['https://example.com', 'https://bad.example'], maxCharacters: 500 }, exec()))
  assert.deepEqual(captured, { urls: ['https://example.com', 'https://bad.example'], text: { maxCharacters: 500 } })
  assert.equal(result.results[0].text, 'page text')
  assert.equal(result.statuses[0].status, 'success')
  assert.equal(result.statuses[1].error.tag, 'FETCH_FAILED')
  assertSchema(tools.get('exa_fetch'), result)
})

test('exa_fetch rejects malformed URLs and excessive batches before any request', async () => {
  const { tools } = install([A])
  let calls = 0
  await withFetch(async () => {
    calls += 1
    return jsonResponse({})
  }, async () => {
    await assert.rejects(() => tools.get('exa_fetch').execute({ urls: ['/relative'] }, exec()), /absolute/u)
    await assert.rejects(() => tools.get('exa_fetch').execute({ urls: ['ftp://example.com'] }, exec()), /HTTP or HTTPS/u)
    await assert.rejects(() => tools.get('exa_fetch').execute({ urls: Array.from({ length: 21 }, (_, i) => 'https://e.test/' + i) }, exec()), /at most 20/u)
    await assert.rejects(() => tools.get('exa_fetch').execute({ urls: ['https://e.test'], maxCharacters: 0 }, exec()), /at least 1/u)
  })
  assert.equal(calls, 0)
})

test('exa_fetch caps extracted text at the declared implementation limit', async () => {
  const { tools } = install([A])
  const huge = 'x'.repeat(60000)
  const result = await withFetch(async () => jsonResponse({
    results: [{ url: 'https://example.com', text: huge }],
  }), async () => tools.get('exa_fetch').execute({ urls: ['https://example.com'], maxCharacters: 50000 }, exec()))
  assert.equal(result.results[0].text.length, 50000 + '\n…[truncated]'.length)
  assert.match(result.results[0].text, /truncated/u)
})
