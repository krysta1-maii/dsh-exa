import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  clampInt,
  dedupe,
  integerArg,
  keyId,
  maskValue,
  optionalEnum,
  optionalStringArray,
  parseIsoDate,
  parseKeyInput,
  parseKeyList,
  requiredHttpUrl,
  requiredHttpUrls,
  reorderByIds,
  selectKeyOrder,
  truncateText,
} from '../src/lib.js'

const A = 'exa_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'exa_bbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const C = 'exa_cccccccccccccccccccccccccccc'

test('parseKeyList trims, splits, drops empties, and dedupes', () => {
  assert.deepEqual(parseKeyList(' ' + A + ' , ' + B + ',\n' + A + ', '), [A, B])
  assert.deepEqual(parseKeyInput([A + ',' + B, C]), [A, B, C])
  assert.deepEqual(parseKeyList(undefined), [])
})

test('dedupe preserves first-seen order', () => {
  assert.deepEqual(dedupe([B, A, B, C]), [B, A, C])
})

test('maskValue hides short values and keeps only a fingerprint', () => {
  assert.equal(maskValue(''), '')
  assert.equal(maskValue('short'), '••••')
  assert.equal(maskValue(A).includes(A), false)
  assert.match(maskValue(A), /^exa_aaaa…/)
})

test('stable IDs are non-secret and distinct', () => {
  assert.equal(keyId(A), keyId(A))
  assert.notEqual(keyId(A), keyId(B))
  assert.match(keyId(A), /^k_[0-9a-f]{16}$/u)
  assert.equal(keyId(A).includes(A), false)
})

test('priority order always starts at the first key', () => {
  assert.deepEqual(selectKeyOrder([A, B, C], 'priority', 0), { order: [A, B, C], nextCursor: 0 })
  assert.deepEqual(selectKeyOrder([A, B, C], 'priority', 99), { order: [A, B, C], nextCursor: 0 })
})

test('round-robin snapshots the cursor and advances exactly once', () => {
  assert.deepEqual(selectKeyOrder([A, B, C], 'round-robin', 0), { order: [A, B, C], nextCursor: 1 })
  assert.deepEqual(selectKeyOrder([A, B, C], 'round-robin', 1), { order: [B, C, A], nextCursor: 2 })
  assert.deepEqual(selectKeyOrder([A, B, C], 'round-robin', 2), { order: [C, A, B], nextCursor: 0 })
  assert.deepEqual(selectKeyOrder([A, B, C], 'round-robin', 5), { order: [C, A, B], nextCursor: 0 })
  assert.deepEqual(selectKeyOrder([], 'round-robin', 5), { order: [], nextCursor: 0 })
})

test('selectKeyOrder returns a fresh array', () => {
  const values = [A, B]
  const result = selectKeyOrder(values, 'priority', 0)
  values.push(C)
  assert.deepEqual(result.order, [A, B])
})

test('reorderByIds requires the complete current set once each', () => {
  const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(reorderByIds(entries, ['c', 'a', 'b']).map((entry) => entry.id), ['c', 'a', 'b'])
  assert.equal(reorderByIds(entries, ['a', 'b']), null)
  assert.equal(reorderByIds(entries, ['a', 'b', 'c', 'd']), null)
  assert.equal(reorderByIds(entries, ['a', 'a', 'c']), null)
  assert.equal(reorderByIds(entries, ['a', 'b', 'x']), null)
})

test('integerArg validates bounds and fallbacks', () => {
  assert.equal(integerArg({}, 'n', { min: 1, max: 5, fallback: 3 }), 3)
  assert.equal(integerArg({ n: 2 }, 'n', { min: 1, max: 5 }), 2)
  assert.throws(() => integerArg({ n: 1.5 }, 'n', { min: 1, max: 5 }), /integer/u)
  assert.throws(() => integerArg({ n: 0 }, 'n', { min: 1, max: 5 }), /at least/u)
  assert.throws(() => integerArg({ n: 6 }, 'n', { min: 1, max: 5 }), /at most/u)
  assert.equal(clampInt(undefined, 1, 5, 2), 2)
})

test('array and enum arguments reject malformed values', () => {
  assert.deepEqual(optionalStringArray({ a: [' x ', 'y'] }, 'a'), ['x', 'y'])
  assert.throws(() => optionalStringArray({ a: 'x' }, 'a'), /array/u)
  assert.throws(() => optionalStringArray({ a: [' '] }, 'a'), /non-empty/u)
  assert.equal(optionalEnum({ mode: 'lite' }, 'mode', ['auto', 'lite']), 'lite')
  assert.throws(() => optionalEnum({ mode: 'deep' }, 'mode', ['auto', 'lite']), /one of/u)
})

test('URL validation accepts only absolute HTTP(S) URLs and dedupes batches', () => {
  assert.equal(requiredHttpUrl(' https://example.com/a ', 'url'), 'https://example.com/a')
  assert.throws(() => requiredHttpUrl('/relative', 'url'), /absolute/u)
  assert.throws(() => requiredHttpUrl('ftp://example.com/a', 'url'), /HTTP or HTTPS/u)
  assert.deepEqual(requiredHttpUrls(['https://a.test', 'https://a.test', 'http://b.test'], 'urls'), ['https://a.test', 'http://b.test'])
  assert.throws(() => requiredHttpUrls([], 'urls'), /at least/u)
  assert.throws(() => requiredHttpUrls(Array.from({ length: 21 }, (_, i) => 'https://e.test/' + i), 'urls'), /at most/u)
})

test('parseIsoDate rejects impossible calendar dates', () => {
  assert.equal(parseIsoDate('2026-02-29'), null)
  assert.equal(parseIsoDate('2026-02-28').dateOnly, true)
  assert.equal(parseIsoDate('not-a-date'), null)
  assert.equal(parseIsoDate('2026-01-01T12:00:00Z').dateOnly, false)
})

test('truncateText is deterministic', () => {
  assert.equal(truncateText('abcdef', 3), 'abc\n…[truncated]')
  assert.equal(truncateText('abc', 3), 'abc')
})
