import assert from 'node:assert/strict'
import { test } from 'node:test'

test('the built client registers the Plugins card and bilingual dictionaries', async () => {
  let loaded = null
  globalThis.window = {
    __ModuleLoader__: {
      load(module) {
        loaded = module
      },
    },
  }
  try {
    await import(new URL('../lib/client.js?test=' + Date.now(), import.meta.url))
  } finally {
    delete globalThis.window
  }
  assert.notEqual(loaded, null)
  assert.equal(loaded.id, 'dsh-exa')
  assert.equal(typeof loaded.factory, 'function')

  const react = {
    createElement() { return { type: 'element' } },
    Fragment: {},
    useCallback: () => () => {},
    useEffect: () => {},
    useMemo: () => null,
    useRef: () => ({ current: null }),
    useState: (value) => [value, () => {}],
  }
  const exported = loaded.factory((name) => {
    if (name === 'react') return react
    throw new Error('unexpected require: ' + name)
  })
  assert.deepEqual(exported.inject.sort(), ['locale', 'slots'])

  let localeRegistration = null
  let slotRegistration = null
  let slotComponent = null
  const ctx = {
    effect(callback) {
      const dispose = callback()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    locale: {
      register(ns, dicts) {
        localeRegistration = { ns, dicts }
        return () => {}
      },
    },
    slots: {
      inject(key, callback) {
        assert.equal(key, 'plugins.bundle.config')
        callback()
        return () => {}
      },
      register(options, component) {
        slotRegistration = options
        slotComponent = component
        return () => {}
      },
    },
  }
  exported.apply(ctx)
  assert.notEqual(localeRegistration, null)
  assert.equal(localeRegistration.ns, 'dshExa')
  assert.equal(typeof localeRegistration.dicts.en.summary, 'string')
  assert.equal(typeof localeRegistration.dicts.zh.summary, 'string')
  assert.equal(Object.keys(localeRegistration.dicts.en).length, Object.keys(localeRegistration.dicts.zh).length)

  assert.deepEqual(slotRegistration, {
    name: 'plugins.bundle.config',
    key: 'dsh-exa',
    id: 'dsh-exa',
    locale: 'dshExa',
  })
  const summary = slotComponent({ view: 'summary', t: (key) => key === 'summary' ? 'SUMMARY' : key })
  assert.equal(summary, 'SUMMARY')
  const page = slotComponent({ view: 'page', t: (key) => key })
  assert.equal(typeof page, 'object')
  assert.equal(page.type, 'element')
})
