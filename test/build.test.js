import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { factory, id } from '../src/client.js'

test('lib/client.js is exactly the current source and locale build', () => {
  const en = JSON.parse(readFileSync('locale/en.json', 'utf8')).card
  const zh = JSON.parse(readFileSync('locale/zh.json', 'utf8')).card
  const expected = 'window.__ModuleLoader__.load({\n'
    + '  id: ' + JSON.stringify(id) + ',\n'
    + '  factory: ' + factory.toString().replace('__UI_DICTS__', JSON.stringify({ en, zh })) + '\n'
    + '});\n'
  assert.equal(readFileSync('lib/client.js', 'utf8'), expected)
})
