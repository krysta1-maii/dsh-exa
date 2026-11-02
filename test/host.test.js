import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { apply, inject, name } from '../src/index.js'
import { makeCredentials, makeCtx } from './helpers.js'

const HOME = mkdtempSync(join(tmpdir(), 'dsh-exa-host-'))
process.env.DSH_HOME = HOME
after(() => rmSync(HOME, { recursive: true, force: true }))

function mount({ keys = ['exa_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'], logger } = {}) {
  const refs = keys.length === 0 ? {} : { EXA_API_KEYS: keys.join(',') }
  const credentials = makeCredentials({ refs })
  const { ctx, tools, routes, sections, effects } = makeCtx({ credentials, logger })
  apply(ctx)
  return { credentials, ctx, tools, routes, sections, effects }
}

function unmount(mounted) {
  for (const dispose of mounted.effects.reverse()) {
    if (typeof dispose === 'function') dispose()
  }
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve))
}

test('the Host entry is the management half of the package', () => {
  assert.equal(name, 'dsh-exa')
  assert.deepEqual([...inject].sort(), ['credentials', 'webServer'])
})

test('Host apply registers one route and no model-facing resources', () => {
  const mounted = mount()
  assert.equal(mounted.tools.size, 0)
  assert.equal(mounted.sections.size, 0)
  assert.deepEqual([...mounted.routes.keys()], ['/api/exa-manager'])
  unmount(mounted)
  assert.equal(mounted.tools.size, 0)
  assert.equal(mounted.sections.size, 0)
  assert.equal(mounted.routes.size, 0)
})

test('Host can be mounted again after a clean unmount without duplicate registrations', () => {
  const first = mount()
  unmount(first)
  const second = mount()
  assert.equal(second.tools.size, 0)
  assert.equal(second.sections.size, 0)
  assert.equal(second.routes.size, 1)
  unmount(second)
})

test('Host warns once per mount when no key is configured', async () => {
  const warnings = []
  const logger = {
    info() {},
    warn(message) { warnings.push(String(message)) },
    error() {},
  }
  const mounted = mount({ keys: [], logger })
  await settle()
  assert.equal(warnings.filter((message) => message.includes('no Exa API key')).length, 1)
  unmount(mounted)
})

test('Host stays silent when a key is configured', async () => {
  const warnings = []
  const logger = {
    info() {},
    warn(message) { warnings.push(String(message)) },
    error() {},
  }
  const mounted = mount({ logger })
  await settle()
  assert.equal(warnings.length, 0)
  unmount(mounted)
})
