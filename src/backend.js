/**
 * Management routes for the Exa card: /api/exa-manager and /api/exa-usage.
 *
 * The manager route owns key-list edits, service-key edits, strategy, and the
 * local-to-Admin key association. The usage route only performs Team
 * Management GETs; a missing or rejected service key degrades to an explicit
 * status without blocking key management.
 */
import { ExaApiError } from './exa-client.js'
import {
  API_KEY_REF,
  API_KEYS_REF,
  READONLY_LIST,
  READONLY_PRIMARY,
  READONLY_SERVICE,
  SERVICE_KEY_REF,
  collectServiceKey,
  collectStoredKeys,
  describeServiceKey,
  keyEntries,
  refWritable,
  writeStoredKeys,
} from './key-manager.js'
import { keyId, maskValue, parseKeyInput, parseKeyList, validateUsageRange } from './lib.js'
import { readManagerState, updateManagerState } from './state.js'
import { adminErrorCode, createUsageClient } from './usage.js'

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
  if (error instanceof ExaApiError) {
    return { status: 502, body: { ok: false, code: 'admin_error', error: error.message } }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message === READONLY_LIST) return { status: 409, body: { ok: false, code: 'readonly_keys', error: READONLY_LIST } }
  if (message === READONLY_PRIMARY) return { status: 409, body: { ok: false, code: 'readonly_primary', error: READONLY_PRIMARY } }
  if (message === READONLY_SERVICE) return { status: 409, body: { ok: false, code: 'readonly_service', error: READONLY_SERVICE } }
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
    service: await refWritable(credentials, SERVICE_KEY_REF),
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
    service: permissions.service,
    add: permissions.list,
    edit,
  }
  return {
    ok: true,
    keys: keyEntries(values, state, writable),
    source,
    strategy: state.strategy,
    writable,
    serviceKey: await describeServiceKey(credentials, state),
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

function assertCanEditService(writable) {
  if (!writable.service) throw new ManagerError('readonly_service', READONLY_SERVICE, 409)
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

function removeStateEntry(state, id) {
  delete state.keySavedAt[id]
  delete state.adminKeyIds[id]
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
    for (const value of added) stateSavedAt(state, keyId(value), now)
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

async function revealServiceKey(credentials) {
  const value = await collectServiceKey(credentials)
  if (value === null) throw new ManagerError('service_not_configured', 'service key is not configured', 404)
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

async function setAdminKeyId(ctx, credentials, body) {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (id.length === 0) throw new ManagerError('invalid_value', 'id is required')
  const { values } = await collectStoredKeys(credentials)
  if (!values.some((value) => keyId(value) === id)) throw new ManagerError('key_not_found', 'key not found', 404)
  const raw = body.adminKeyId
  let adminKeyId = null
  if (raw !== undefined && raw !== null && raw !== '') {
    if (typeof raw !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(raw.trim())) {
      throw new ManagerError('invalid_value', 'adminKeyId must be a team key id or null')
    }
    adminKeyId = raw.trim()
  }
  try {
    updateManagerState((state) => {
      if (adminKeyId === null) delete state.adminKeyIds[id]
      else state.adminKeyIds[id] = adminKeyId
      return state
    })
  } catch (error) {
    throw new ManagerError('save_failed', 'could not persist the key association: ' + (error instanceof Error ? error.message : String(error)), 500)
  }
  return managerPayload(credentials)
}

async function setServiceKey(ctx, credentials, body) {
  const value = typeof body.value === 'string' ? body.value.trim() : ''
  if (value.length === 0) throw new ManagerError('invalid_value', 'service key value is required')
  const permissions = await writableSnapshot(credentials)
  assertCanEditService(permissions)
  await credentials.set(SERVICE_KEY_REF, value)
  const now = new Date().toISOString()
  updateStateSafely(ctx, (state) => {
    state.serviceKeySavedAt = now
    return state
  })
  return managerPayload(credentials)
}

async function removeServiceKey(ctx, credentials) {
  const permissions = await writableSnapshot(credentials)
  assertCanEditService(permissions)
  await credentials.unset(SERVICE_KEY_REF)
  updateStateSafely(ctx, (state) => {
    state.serviceKeySavedAt = null
    return state
  })
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
    const revealService = url.searchParams.get('revealService')
    if (revealService === '1' || revealService === 'true' || reveal === 'service') {
      const value = await revealServiceKey(credentials)
      sendJson(res, 200, { ok: true, value })
      return
    }
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
    case 'setAdminKeyId':
      payload = await setAdminKeyId(ctx, credentials, body)
      break
    case 'setServiceKey':
      payload = await setServiceKey(ctx, credentials, body)
      break
    case 'removeServiceKey':
      payload = await removeServiceKey(ctx, credentials)
      break
    default:
      throw new ManagerError('invalid_action', 'unsupported action')
  }
  sendJson(res, 200, payload)
}

async function usageRoute(usageClient, credentials, req, res) {
  if (credentials === undefined || credentials === null) {
    sendJson(res, 500, { ok: false, code: 'credentials_unavailable', error: 'credentials service unavailable' })
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, code: 'method_not_allowed', error: 'method not allowed' })
    return
  }
  const url = new URL(req.url || '/', 'http://localhost')
  const range = validateUsageRange(url.searchParams.get('start_date'), url.searchParams.get('end_date'))
  if (!range.ok) {
    sendJson(res, 400, { ok: false, code: range.code, error: range.message })
    return
  }
  const refresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true'
  const serviceKey = await collectServiceKey(credentials)
  if (serviceKey === null) {
    sendJson(res, 200, {
      ok: true,
      configured: false,
      range,
      rows: [],
      teamKeys: [],
      message: 'Team Management service key is not configured',
      fetchedAt: new Date().toISOString(),
    })
    return
  }
  const { values } = await collectStoredKeys(credentials)
  const state = readManagerState()
  let teamKeys
  try {
    teamKeys = await usageClient.getTeamKeys(serviceKey, { refresh })
  } catch (error) {
    const code = adminErrorCode(error)
    sendJson(res, 200, {
      ok: false,
      configured: true,
      code,
      error: error instanceof Error ? error.message : String(error),
      range,
      rows: [],
      teamKeys: [],
      fetchedAt: new Date().toISOString(),
    })
    return
  }
  const teamById = new Map(teamKeys.map((entry) => [entry.id, entry]))
  const rows = []
  for (const value of values) {
    const id = keyId(value)
    const masked = maskValue(value)
    const saved = typeof state.adminKeyIds[id] === 'string' ? state.adminKeyIds[id] : null
    const direct = teamById.has(value) ? value : null
    const adminKeyId = saved ?? direct
    if (adminKeyId === null) {
      rows.push({ ok: false, id, masked, code: 'unlinked', error: 'key is not linked to a team key' })
      continue
    }
    const adminKey = teamById.get(adminKeyId)
    if (adminKey === undefined) {
      rows.push({
        ok: false,
        id,
        masked,
        adminKeyId,
        code: 'not_in_team',
        error: 'the linked team key is not in the current team key list',
      })
      continue
    }
    try {
      const usage = await usageClient.getUsage(serviceKey, adminKeyId, range, { refresh })
      rows.push({
        ok: true,
        id,
        masked,
        adminKeyId,
        name: adminKey.name,
        rateLimit: adminKey.rateLimit,
        budgetCents: adminKey.budgetCents,
        isOverBudget: adminKey.isOverBudget,
        totalCostUsd: usage.totalCostUsd,
        costBreakdown: usage.costBreakdown,
        period: usage.period,
      })
    } catch (error) {
      rows.push({
        ok: false,
        id,
        masked,
        adminKeyId,
        name: adminKey.name,
        rateLimit: adminKey.rateLimit,
        budgetCents: adminKey.budgetCents,
        isOverBudget: adminKey.isOverBudget,
        code: adminErrorCode(error),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const totalCostUsd = rows.reduce((sum, row) => row.ok ? sum + row.totalCostUsd : sum, 0)
  sendJson(res, 200, {
    ok: true,
    configured: true,
    range,
    rows,
    teamKeys,
    totalCostUsd,
    fetchedAt: new Date().toISOString(),
  })
}

/**
 * Install both exact routes and the usage cache on the owning fiber.
 * Repeated installs register fresh route objects; unloading removes them.
 */
export function installBackend(ctx) {
  const credentials = ctx.get('credentials')
  const usageClient = createUsageClient()
  ctx.effect(() => () => usageClient.clear(), 'dsh-exa: usage cache')

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

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/exa-usage',
    handler: async (req, res) => {
      try {
        await usageRoute(usageClient, credentials, req, res)
      } catch (error) {
        const code = error instanceof ManagerError ? error.code : 'usage_unavailable'
        const status = error instanceof ManagerError ? error.status : 500
        log(ctx, 'warn', 'dsh-exa: usage route failed: %s', code)
        sendJson(res, status, { ok: false, code, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'dsh-exa: route /api/exa-usage')
}
