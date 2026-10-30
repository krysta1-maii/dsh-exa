/**
 * Non-secret manager state: routing strategy, per-key active flags, and
 * display timestamps. Key values are never written here.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

export const STATE_FILE = 'exa-manager.json'
export const STATE_VERSION = 2

/** Fresh state used when the file is missing, corrupt, or partially written. */
export function defaultManagerState() {
  return {
    version: STATE_VERSION,
    strategy: 'priority',
    keySavedAt: {},
    inactiveKeys: {},
    updatedAt: null,
  }
}

/** Absolute path of the manager state file. */
export function managerStatePath() {
  return join(resolveDshHome(), STATE_FILE)
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringMap(value) {
  if (!plainObject(value)) return {}
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof key === 'string' && typeof item === 'string' && item.length > 0) out[key] = item
  }
  return out
}

function inactiveRecord(value) {
  if (!plainObject(value)) return null
  const reason = typeof value.reason === 'string' && value.reason.length > 0 ? value.reason : null
  const at = typeof value.at === 'string' && value.at.length > 0 ? value.at : null
  if (reason === null || at === null) return null
  return { reason, at }
}

function inactiveMap(value) {
  if (!plainObject(value)) return {}
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof key !== 'string' || key.length === 0) continue
    const record = inactiveRecord(item)
    if (record !== null) out[key] = record
  }
  return out
}

/** Normalize any parsed state into the current shape without throwing. */
export function normalizeManagerState(value) {
  const base = defaultManagerState()
  if (!plainObject(value)) return base
  return {
    version: STATE_VERSION,
    strategy: value.strategy === 'round-robin' ? 'round-robin' : 'priority',
    keySavedAt: stringMap(value.keySavedAt),
    inactiveKeys: inactiveMap(value.inactiveKeys),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  }
}

/** Return the stored inactive record for one key id, or null when active. */
export function inactiveEntry(state, id) {
  if (!plainObject(state) || !plainObject(state.inactiveKeys) || typeof id !== 'string') return null
  return inactiveRecord(state.inactiveKeys[id])
}

/** Whether one key id is currently excluded from routing. */
export function isKeyInactive(state, id) {
  return inactiveEntry(state, id) !== null
}

/** Read manager state; missing or unreadable content becomes fresh state. */
export function readManagerState() {
  try {
    const parsed = JSON.parse(readFileSync(managerStatePath(), 'utf8'))
    return normalizeManagerState(parsed)
  } catch {
    return defaultManagerState()
  }
}

/** Write manager state atomically with owner-only permissions where supported. */
export function writeManagerState(value) {
  const next = normalizeManagerState(value)
  next.updatedAt = new Date().toISOString()
  const path = managerStatePath()
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = path + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2, 10)
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
  try {
    chmodSync(tmp, 0o600)
  } catch {
    /* Windows and some filesystems do not implement POSIX modes. */
  }
  renameSync(tmp, path)
  try {
    chmodSync(path, 0o600)
  } catch {
    /* Keep the existing platform permissions when chmod is unavailable. */
  }
  return next
}

/**
 * Read-modify-write. The mutator receives a copy of the nested maps so callers
 * cannot accidentally mutate the object read from disk.
 */
export function updateManagerState(mutator) {
  const current = readManagerState()
  const inactiveKeys = {}
  for (const [key, record] of Object.entries(current.inactiveKeys)) {
    inactiveKeys[key] = { ...record }
  }
  const draft = {
    ...current,
    keySavedAt: { ...current.keySavedAt },
    inactiveKeys,
  }
  const next = mutator(draft)
  return writeManagerState(next === undefined ? draft : next)
}
