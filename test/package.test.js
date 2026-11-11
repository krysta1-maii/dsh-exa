import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')
const json = (path) => JSON.parse(read(path))

test('package manifest declares the bundle, client, and display resources', () => {
  const pkg = json('package.json')
  assert.equal(pkg.name, 'dsh-exa')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.exports['.'], './src/index.js')
  assert.equal(pkg.exports['./tools'], './src/tools-entry.js')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.equal(pkg.exports['./icon'], './icon.svg')
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-plugin-manager'))
  assert.ok(pkg.files.includes('lib'))
  assert.ok(pkg.files.includes('docs'))
  assert.ok(pkg.files.includes('cordis.patch.yml'))
  assert.ok(pkg.files.includes('icon.svg'))
  assert.match(pkg.engines.node, />=22/u)
})

test('package manifest declares the DSH 0.2.1 and 0.2.2 lines', () => {
  const pkg = json('package.json')
  const range = '>=0.2.1-0 <0.2.2-0 || >=0.2.2-0 <0.2.3-0'
  assert.equal(pkg.engines.dsh, range)
  assert.equal(pkg.dsh.compatibility.dsh, range)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-home-paths'], range)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-tools'], range)
  assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], '>=4.0.5 <5.0.0')
  assert.deepEqual(Object.keys(pkg.dsh.compatibility.dshReleases), ['0.2.1-rc.3', '0.2.1-rc.5', '0.2.2-rc.2'])
  assert.equal(pkg.dsh.compatibility.dshReleases['0.2.2-rc.2'], 'source-checked')
})

test('Exa requests carry the current package version as the user agent', () => {
  const pkg = json('package.json')
  assert.ok(read('src/exa-client.js').includes(`dsh-exa/${pkg.version}`))
})

test('the package keeps one install with a Host entry and a preset entry', () => {
  const pkg = json('package.json')
  assert.equal(pkg.main, './src/index.js')
  assert.equal(pkg.name, 'dsh-exa')
  const host = read('src/index.js')
  const preset = read('src/tools-entry.js')
  // The Host half owns the management route; the preset half owns the tools.
  assert.match(host, /installBackend/u)
  assert.equal(host.includes('installTools'), false)
  assert.equal(host.includes("from './tools.js'"), false)
  assert.match(preset, /installTools/u)
  assert.equal(preset.includes('installBackend'), false)
  assert.equal(preset.includes("from './backend.js'"), false)
  assert.match(preset, /export const name = 'dsh-exa-tools'/u)
  assert.match(preset, /export const inject = \['tools', 'credentials', 'systemPrompt'\]/u)
})

test('cordis patch inserts exactly one dsh-exa row', () => {
  const patch = read('cordis.patch.yml')
  assert.match(patch, /id: dsh-exa/u)
  assert.match(patch, /name: 'dsh-exa'/u)
  assert.equal((patch.match(/id: dsh-exa/gu) || []).length, 1)
})

test('locale metadata is bilingual and card dictionaries have identical key sets', () => {
  const en = json('locale/en.json')
  const zh = json('locale/zh.json')
  assert.equal(typeof en.meta.title, 'string')
  assert.equal(typeof en.meta.description, 'string')
  assert.equal(typeof zh.meta.title, 'string')
  assert.equal(typeof zh.meta.description, 'string')
  assert.notEqual(en.meta.title, zh.meta.title)
  const enKeys = Object.keys(en.card).sort()
  const zhKeys = Object.keys(zh.card).sort()
  assert.deepEqual(enKeys, zhKeys)
  assert.ok(enKeys.length > 70)
  for (const key of ['summary', 'keys.title', 'billing.title', 'billing.open', 'footer']) {
    assert.equal(typeof en.card[key], 'string')
    assert.equal(typeof zh.card[key], 'string')
    assert.ok(en.card[key].length > 0)
    assert.ok(zh.card[key].length > 0)
  }
})

test('icon is a small local SVG image', () => {
  const icon = read('icon.svg')
  assert.match(icon, /^<svg /u)
  assert.match(icon, /width="24"/u)
  assert.match(icon, /height="24"/u)
  assert.ok(statSync(join(root, 'icon.svg')).size < 256 * 1024)
})

test('the source client contains the build placeholder and the built bundle replaced it', () => {
  const source = read('src/client.js')
  assert.match(source, /const DICTS = __UI_DICTS__/u)
  assert.ok((source.match(/__UI_DICTS__/gu) || []).length >= 1)
  const built = read('lib/client.js')
  assert.match(built, /^window\.__ModuleLoader__\.load\(/u)
  assert.match(built, /id: "dsh-exa"/u)
  assert.equal(built.includes('__UI_DICTS__'), false)
  assert.equal(built.includes('export '), false)
  assert.match(built, /https:\/\/dashboard\.exa\.ai\/billing/u)
  assert.equal(built.includes('/api/exa-usage'), false)
})

test('all JavaScript source files pass node --check', () => {
  for (const file of [
    'src/index.js',
    'src/tools-entry.js',
    'src/lib.js',
    'src/state.js',
    'src/key-manager.js',
    'src/exa-client.js',
    'src/tools.js',
    'src/backend.js',
    'src/client.js',
    'lib/client.js',
    'scripts/build-client.mjs',
  ]) {
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'pipe' })
  }
})
