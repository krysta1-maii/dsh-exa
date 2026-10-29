/**
 * Build lib/client.js from src/client.js and the card dictionaries in
 * locale/en.json and locale/zh.json.
 *
 * The browser module loader expects a lazy CommonJS factory:
 * window.__ModuleLoader__.load({ id, factory(require) { ... } })
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { factory, id } from '../src/client.js'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const input = join(root, 'src', 'client.js')
const output = join(root, 'lib', 'client.js')

const [enDoc, zhDoc] = await Promise.all([
  readFile(join(root, 'locale', 'en.json'), 'utf8').then(JSON.parse),
  readFile(join(root, 'locale', 'zh.json'), 'utf8').then(JSON.parse),
])
const en = enDoc.card
const zh = zhDoc.card
if (en === null || typeof en !== 'object' || Array.isArray(en)) throw new Error('locale/en.json is missing the card dictionary')
if (zh === null || typeof zh !== 'object' || Array.isArray(zh)) throw new Error('locale/zh.json is missing the card dictionary')
const enKeys = Object.keys(en).sort()
const zhKeys = Object.keys(zh).sort()
if (enKeys.length !== zhKeys.length || enKeys.some((key, index) => key !== zhKeys[index])) {
  const missingZh = enKeys.filter((key) => !(key in zh))
  const missingEn = zhKeys.filter((key) => !(key in en))
  throw new Error('card dictionaries differ; missing zh: ' + missingZh.join(', ') + '; missing en: ' + missingEn.join(', '))
}

const marker = '__UI_DICTS__'
const factoryText = factory.toString()
if (factoryText.split(marker).length !== 2) throw new Error('src/client.js must contain exactly one ' + marker + ' placeholder')
const withDictionaries = factoryText.replace(marker, JSON.stringify({ en, zh }))
const source = 'window.__ModuleLoader__.load({\n'
  + '  id: ' + JSON.stringify(id) + ',\n'
  + '  factory: ' + withDictionaries + '\n'
  + '});\n'

await mkdir(dirname(output), { recursive: true })
await writeFile(output, source)
execFileSync(process.execPath, ['--check', output], { stdio: 'inherit' })
console.log('wrote ' + output + ' (' + source.length + ' bytes)')
