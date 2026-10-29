import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { apply } from '../src/index.js'
import { makeCredentials, makeCtx } from './helpers.js'

const HOME = mkdtempSync(join(tmpdir(), 'dsh-exa-host-'))
process.env.DSH_HOME = HOME
after(() => rmSync(HOME, { recursive: true, force: true }))

function mount() {
  const credentials = makeCredentials({ refs: { EXA_API_KEYS: 'exa_aaaaaaaaaaaaaaaaaaaaaaaaaaaa' } })
  const { ctx, tools, routes, sections, effects } = makeCtx({ credentials })
  apply(ctx)
  return { credentials, ctx, tools, routes, sections, effects }
}

function unmount(mounted) {
  for (const dispose of mounted.effects.reverse()) {
    if (typeof dispose === 'function') dispose()
  }
}

test('Host apply registers three tools, two routes, and one prompt section', () => {
  const mounted = mount()
  assert.deepEqual([...mounted.tools.keys()].sort(), ['exa_fetch', 'exa_search', 'exa_search_advanced'])
  assert.deepEqual([...mounted.routes.keys()].sort(), ['/api/exa-manager', '/api/exa-usage'])
  assert.deepEqual([...mounted.sections.keys()], ['tool:exa'])
  assert.equal(mounted.sections.get('tool:exa').order, 111)
  unmount(mounted)
  assert.equal(mounted.tools.size, 0)
  assert.equal(mounted.routes.size, 0)
  assert.equal(mounted.sections.size, 0)
})

test('Host can be mounted again after a clean unmount without duplicate registrations', () => {
  const first = mount()
  unmount(first)
  const second = mount()
  assert.equal(second.tools.size, 3)
  assert.equal(second.routes.size, 2)
  assert.equal(second.sections.size, 1)
  unmount(second)
})
