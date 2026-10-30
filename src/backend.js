/**
 * Management route for the Exa card: /api/exa-manager.
 *
 * The route owns key-list edits and the routing strategy. It never performs
 * Exa search, contents, or billing requests; those stay in the tools or in the
 * Exa dashboard.
 */
import {
  API_KEY_REF,
  API_KEYS_REF,
  READONLY_LIST,
  READONLY_PRIMARY,
  collectStoredKeys,
  keyEntries,
  refWritable,
  writeStoredKeys,
} from './key-manager.js'
import { keyId, parseKeyInput, parseKeyList } from './lib.js'
import { readManagerState, updateManagerState } from './state.js'

const BODY_LIMIT = 1024 * 1024

class ManagerError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'ManagerError'
    this.code = code
    this.status = status
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > BODY_LIMIT) {
        fail(new ManagerError('payload_too_large', 'request body is too large', 413))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.length === 0) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(text)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new ManagerError('invalid_value', 'request body must be a JSON object'))
          return
        }
        resolve(parsed)
      } catch {
        reject(new ManagerError('invalid_value', 'request body is not valid JSON'))
      }
    })
    req.on('error', (error) => fail(new ManagerError('invalid_value', error instanceof Error ? error.message : 'request stream failed')))
  })
}

function errorPayload(error) {
  if (error instanceof ManagerError) {
    return { status: error.status, body: { ok: false, code: error.code, error: error.message } }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message === READONLY_LIST) return { status: 409, body: { ok: false, code: 'readonly_keys', error: READONLY_LIST } }
  if (message === READONLY_PRIMARY) return { status: 409, body: { ok: false, code: 'readonly_primary', error: READONLY_PRIMARY } }
  return { status: 500, body: { ok: false, code: 'save_failed', error: message } }
}

function log(ctx, level, message, ...args) {
  const logger = ctx !== undefined && ctx !== null ? ctx.logger : undefined
  const method = logger !== undefined && logger !== null && typeof logger[level] === 'function' ? logger[level] : undefined
  if (method === undefined) return
  try {
    method.call(logger, message, ...args)
  } catch {
    /* Logging must never change an HTTP outcome. */
  }
}

async function writableSnapshot(credentials) {
  return {
    list: await refWritable(credentials, API_KEYS_REF),
    primary: await refWritable(credentials, API_KEY_REF),
  }
}

/** Build the complete manager payload without any full key value. */
async function managerPayload(credentials) {
  const state = readManagerState()
  const { values, source } = await collectStoredKeys(credentials)
  const permissions = await writableSnapshot(credentials)
  const edit = source === 'primary' ? permissions.primary : permissions.list
  const writable = {
    list: permissions.list,
    primary: permissions.primary,
    add: permissions.list,
    edit,
  }
  const keys = keyEntries(values, state, writable)
  const activeCount = keys.filter((entry) => entry.active).length
  return {
    ok: true,
    keys,
    source,
    strategy: state.strategy,
    writable,
    activeCount,
    inactiveCount: keys.length - activeCount,
    allInactive: keys.length > 0 && activeCount === 0,
    updatedAt: state.updatedAt,
  }
}

function assertCanEdit(source, writable) {
  if (source === 'primary') {
    if (!writable.primary) throw new ManagerError('readonly_primary', READONLY_PRIMARY, 409)
    return
  }
  if (!writable.list) throw new ManagerError('readonly_keys', READONLY_LIST, 409)
}

function assertCanAdd(writable) {
  if (!writable.list) throw new ManagerError('readonly_keys', READONLY_LIST, 409)
}

function idsFromBody(body) {
  const raw = Array.isArray(body.ids)
    ? body.ids
    : Array.isArray(body.remove)
      ? body.remove
      : body.id !== undefined
        ? [body.id]
        : []
  const out = []
  const seen = new Set()
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const id = value.trim()
    if (id.length > 0 && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

function indexById(values) {
  const map = new Map()
  for (const value of values) map.set(keyId(value), value)
  return map
}

function stateSavedAt(state, id, now) {
  state.keySavedAt[id] = now
}

function markInactiveEntry(state, id, reason, now) {
  state.inactiveKeys[id] = { reason, at: now }
}

function removeInactiveEntry(state, id) {
  delete state.inactiveKeys[id]
}

function removeStateEntry(state, id) {
  delete state.keySavedAt[id]
  delete state.inactiveKeys[id]
}

function updateStateSafely(ctx, mutator) {
  try {
    return updateManagerState(mutator)
  } catch (error) {
    log(ctx, 'warn', 'dsh-exa: manager state write failed: %s', error instanceof Error ? error.message : String(error))
    return null
  }
}

async function addKeys(ctx, credentials, body) {
  const incoming = parseKeyInput(body.keys ?? body.add ?? body.value)
  if (incoming.length === 0) throw new ManagerError('invalid_value', 'at least one non-empty key is required')
  const { values, source } = await collectStoredKeys(credentials)
  const permissions = await writableSnapshot(credentials)
  assertCanAdd(permissions)
  const existing = new Set(values)
  const added = incoming.filter((value) => !existing.has(value))
  if (added.length === 0) {
    return { ...(await managerPayload(credentials)), added: 0 }
  }
  const next = [...values, ...added]
  await writeStoredKeys(credentials, next, {
    source,
    listWritable: permissions.list,
    primaryWritable: permissions.primary,
  })
  const now = new Date().toISOString()
  updateStateSafely(ctx, (state) => {
    for (const value of added) {
      const id = keyId(value)
      stateSavedAt(state, id, now)
      removeInactiveEntry(state, id)
    }
    return state
  })
  return { ...(await managerPayload(credentials)), added: added.length }
}

async function revealKey(credentials, id) {
  const { values } = await collectStoredKeys(credentials)
  const value = values.find((item) => keyId(item) === id)
  if (value === undefined) throw new ManagerError('key_not_found', 'key not found', 404)
  return value
}

async function replaceKey(ctx, credentials, body) {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const value = typeof body.value === 'string' ? body.value.trim() : ''
  if (id.length === 0) throw new ManagerError('invalid_value', 'id is required')
  if (value.length === 0) throw new ManagerError('invalid_value', 'replacement value is required')
  const { values, source } = await collectStoredKeys(credentials)
  const index = values.findIndex((item) => keyId(item) === id)
  if (index < 0) throw new ManagerError('key_not_found', 'key not found', 404)
  if (values.some((item, itemIndex) => itemIndex !== index && item === value)) {
    throw new ManagerError('duplicate_key', 'that key is already configured', 409)
  }
  const permissions = await writableSnapshot(credentials)
  assertCanEdit(source, permissions)
  const next = values.slice()
  next[index] = value
  await writeStoredKeys(credentials, next, {
    source,
    listWritable: permissions.list,
    primaryWritable: permissions.primary,
  })
  const now = new Date().toISOString()
  updateStateSafely(ctx, (state) => {
    removeStateEntry(state, id)
    removeInactiveEntry(state, keyId(value))
    stateSavedAt(state, keyId(value), now)
    return state
  })
  return managerPayload(credentials)
}

async function removeKeys(ctx, credentials, body) {
  const ids = idsFromBody(body)
  if (ids.length === 0) throw new ManagerError('invalid_value', 'at least one key id is required')
  const { values, source } = await collectStoredKeys(credentials)
  const byId = indexById(values)
  for (const id of ids) {
    if (!byId.has(id)) throw new ManagerError('key_not_found', 'key not found', 404)
  }
  const permissions = await writableSnapshot(credentials)
  assertCanEdit(source, permissions)
  const next = values.filter((value) => !ids.includes(keyId(value)))
  if (next.length === 0 && source !== 'primary' && !permissions.primary) {
    const inherited = parseKeyList((await credentials.resolve(API_KEY_REF))?.value ?? '')
    if (inherited.length > 0) throw new ManagerError('readonly_primary', READONLY_PRIMARY, 409)
  }
  await writeStoredKeys(credentials, next, {
    source,
    listWritable: permissions.list,
    primaryWritable: permissions.primary,
  })
  updateStateSafely(ctx, (state) => {
    for (const id of ids) removeStateEntry(state, id)
    return state
  })
  return managerPayload(credentials)
}

async function reorderKeys(ctx, credentials, body) {
  const ids = idsFromBody(body)
  const { values, source } = await collectStoredKeys(credentials)
  if (ids.length !== values.length) {
    throw new ManagerError('invalid_order', 'order must list every current key exactly once', 409)
  }
  const byId = indexById(values)
  const seen = new Set()
  const next = []
  for (const id of ids) {
    const value = byId.get(id)
    if (value === undefined || seen.has(id)) {
      throw new ManagerError('invalid_order', 'order must list every current key exactly once', 409)
    }
    seen.add(id)
    next.push(value)
  }
  const permissions = await writableSnapshot(credentials)
  assertCanEdit(source, permissions)
  await writeStoredKeys(credentials, next, {
    source,
    listWritable: permissions.list,
    primaryWritable: permissions.primary,
  })
  return managerPayload(credentials)
}

async function setStrategy(ctx, credentials, body) {
  const strategy = typeof body.strategy === 'string' ? body.strategy : ''
  if (strategy !== 'priority' && strategy !== 'round-robin') {
    throw new ManagerError('invalid_value', 'strategy must be priority or round-robin')
  }
  try {
    updateManagerState((state) => {
      state.strategy = strategy
      return state
    })
  } catch (error) {
    throw new ManagerError('save_failed', 'could not persist the routing strategy: ' + (error instanceof Error ? error.message : String(error)), 500)
  }
  return managerPayload(credentials)
}

/**
 * Local active flag for one key. This never touches credential storage, so it
 * also works for keys supplied read-only by the launching environment.
 */
async function setKeyActive(credentials, body) {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (id.length === 0) throw new ManagerError('invalid_value', 'id is required')
  if (typeof body.active !== 'boolean') throw new ManagerError('invalid_value', 'active must be a boolean')
  const { values } = await collectStoredKeys(credentials)
  if (!values.some((value) => keyId(value) === id)) {
    throw new ManagerError('key_not_found', 'key not found', 404)
  }
  try {
    updateManagerState((state) => {
      if (body.active) removeInactiveEntry(state, id)
      else markInactiveEntry(state, id, 'manual', new Date().toISOString())
      return state
    })
  } catch (error) {
    throw new ManagerError(
      'save_failed',
      'could not persist the key state: ' + (error instanceof Error ? error.message : String(error)),
      500,
    )
  }
  return managerPayload(credentials)
}

async function managerRoute(ctx, credentials, req, res) {
  if (credentials === undefined || credentials === null) {
    sendJson(res, 500, { ok: false, code: 'credentials_unavailable', error: 'credentials service unavailable' })
    return
  }
  const url = new URL(req.url || '/', 'http://localhost')
  if (req.method === 'GET') {
    const reveal = url.searchParams.get('reveal')
    if (reveal !== null) {
      const value = await revealKey(credentials, reveal)
      sendJson(res, 200, { ok: true, value })
      return
    }
    sendJson(res, 200, await managerPayload(credentials))
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, code: 'method_not_allowed', error: 'method not allowed' })
    return
  }
  const body = await readBody(req)
  const action = typeof body.action === 'string' ? body.action : ''
  let payload
  switch (action) {
    case 'add':
      payload = await addKeys(ctx, credentials, body)
      break
    case 'replace':
      payload = await replaceKey(ctx, credentials, body)
      break
    case 'remove':
      payload = await removeKeys(ctx, credentials, body)
      break
    case 'reorder':
      payload = await reorderKeys(ctx, credentials, body)
      break
    case 'setStrategy':
      payload = await setStrategy(ctx, credentials, body)
      break
    case 'setKeyActive':
      payload = await setKeyActive(credentials, body)
      break
    default:
      throw new ManagerError('invalid_action', 'unsupported action')
  }
  sendJson(res, 200, payload)
}

/** Install the exact management route on the owning fiber. */
export function installBackend(ctx) {
  const credentials = ctx.get('credentials')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/exa-manager',
    handler: async (req, res) => {
      try {
        await managerRoute(ctx, credentials, req, res)
      } catch (error) {
        const mapped = errorPayload(error)
        log(ctx, 'warn', 'dsh-exa: manager route failed: %s', mapped.body.code)
        sendJson(res, mapped.status, mapped.body)
      }
    },
  }), 'dsh-exa: route /api/exa-manager')
}
