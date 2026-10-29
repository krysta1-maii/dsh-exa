/**
 * Exa HTTP transport, error classification, key failover, and warning logging.
 *
 * Failover is deliberately narrow: only 401, 402, and 429 move to another key.
 * 402 covers both exhausted credits and a key or team budget being exceeded.
 * Timeouts, caller cancellation, and network failures are surfaced immediately.
 */
import { collectStoredKeys } from './key-manager.js'
import { selectKeyOrder } from './lib.js'
import { readManagerState } from './state.js'

export const EXA_BASE_URL = 'https://api.exa.ai'
export const ADMIN_BASE_URL = 'https://admin-api.exa.ai/team-management'
export const RETRYABLE_STATUSES = new Set([401, 402, 429])

/** Error carrying only non-secret Exa diagnostics. */
export class ExaApiError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ExaApiError'
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
    this.tag = options.tag
    this.operation = options.operation
    this.retryable = options.retryable === true
  }
}

/**
 * Combine a caller signal with a hard timeout. The caller must dispose the
 * returned object after the request, including in error paths.
 */
export function combineSignals(signal, ms) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, ms)
  timer.unref?.()
  const onAbort = () => controller.abort()
  if (signal !== undefined && signal !== null) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    get timedOut() { return timedOut },
    dispose() {
      clearTimeout(timer)
      if (signal !== undefined && signal !== null) signal.removeEventListener('abort', onAbort)
    },
  }
}

/** Parse a response body as JSON without throwing on an empty or non-JSON body. */
export async function readResponseJson(response) {
  const text = await response.text()
  if (text.length === 0) return { text, json: null }
  try {
    return { text, json: JSON.parse(text) }
  } catch {
    return { text, json: null }
  }
}

/**
 * One HTTP round trip. Non-2xx statuses are returned as data so the caller can
 * decide whether they are retryable; transport failures throw ExaApiError.
 */
export async function requestJson({ url, method = 'GET', headers, body, signal, timeoutMs = 30000 }) {
  const combined = combineSignals(signal, timeoutMs)
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: combined.signal,
    })
    const parsed = await readResponseJson(response)
    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      requestId: response.headers.get('x-request-id') ?? undefined,
      json: parsed.json,
      text: parsed.text,
    }
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || combined.signal.aborted)) {
      throw new ExaApiError(
        combined.timedOut ? 'request timed out' : 'request was cancelled',
        { code: combined.timedOut ? 'timeout' : 'cancelled', cause: error },
      )
    }
    throw new ExaApiError(
      'network error: ' + (error instanceof Error ? error.message : String(error)),
      { code: 'network', cause: error },
    )
  } finally {
    combined.dispose()
  }
}

/** Extract the standard Exa error envelope without assuming its shape. */
export function errorDetails(json, fallback) {
  let message = fallback
  let requestId
  let tag
  if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
    if (typeof json.error === 'string' && json.error.length > 0) message = json.error
    else if (json.error !== null && typeof json.error === 'object' && typeof json.error.message === 'string') {
      message = json.error.message
    }
    if (typeof json.requestId === 'string') requestId = json.requestId
    if (typeof json.tag === 'string') tag = json.tag
  }
  return { message, requestId, tag }
}

function httpError(operation, statusValue, json, headerRequestId) {
  const details = errorDetails(json, 'HTTP ' + statusValue)
  const requestId = details.requestId ?? headerRequestId
  const parts = ['exa_' + operation + ': HTTP ' + statusValue]
  if (details.tag !== undefined) parts.push('tag ' + details.tag)
  if (requestId !== undefined) parts.push('requestId ' + requestId)
  if (details.message.length > 0) parts.push(details.message)
  return new ExaApiError(parts.join(' — '), {
    status: statusValue,
    code: 'http_error',
    requestId,
    tag: details.tag,
    operation,
  })
}

/**
 * POST to an Exa search or contents endpoint with one key. Retryable statuses
 * are returned as data; every other failure throws without leaking the key.
 */
export async function callExaOperation(path, body, key, { signal, timeoutMs = 60000, operation = path } = {}) {
  const result = await requestJson({
    url: EXA_BASE_URL + path,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: 'Bearer ' + key,
      'user-agent': 'dsh-exa/0.1.0',
    },
    body: JSON.stringify(body),
    signal,
    timeoutMs,
  })
  if (RETRYABLE_STATUSES.has(result.status)) {
    const details = errorDetails(result.json, 'HTTP ' + result.status)
    return {
      kind: 'retryable',
      status: result.status,
      requestId: details.requestId ?? result.requestId,
      tag: details.tag,
      message: details.message,
    }
  }
  if (!result.ok) throw httpError(operation, result.status, result.json, result.requestId)
  if (result.json === null || typeof result.json !== 'object' || Array.isArray(result.json)) {
    throw new ExaApiError('exa_' + operation + ': response was not a JSON object', {
      status: result.status,
      code: 'invalid_response',
      operation,
    })
  }
  return { kind: 'ok', status: result.status, json: result.json, requestId: result.requestId }
}

/** Admin API request using the Team Management service key. */
export async function callAdminApi(path, serviceKey, { signal, timeoutMs = 15000, query, operation = 'admin' } = {}) {
  const url = new URL(ADMIN_BASE_URL + path)
  if (query !== undefined && query !== null) {
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(name, String(value))
    }
  }
  const result = await requestJson({
    url: url.toString(),
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-api-key': serviceKey,
      'user-agent': 'dsh-exa/0.1.0',
    },
    signal,
    timeoutMs,
  })
  if (!result.ok) {
    throw httpError(operation, result.status, result.json, result.requestId)
  }
  if (result.json === null || typeof result.json !== 'object') {
    throw new ExaApiError('exa_' + operation + ': response was not a JSON object', {
      status: result.status,
      code: 'invalid_response',
      operation,
    })
  }
  return result.json
}

function log(ctx, level, message, ...args) {
  const logger = ctx !== undefined && ctx !== null ? ctx.logger : undefined
  const method = logger !== undefined && logger !== null && typeof logger[level] === 'function' ? logger[level] : undefined
  if (method === undefined) return
  try {
    method.call(logger, message, ...args)
  } catch {
    /* Logging must never affect a tool result. */
  }
}

/**
 * Run one operation through the configured key order.
 *
 * The order is snapshotted before the first request. Every distinct key is
 * tried at most once. The round-robin cursor advances once per call, even when
 * the first key succeeds.
 */
export async function performWithFailover(ctx, rotation, { operation, path, body, timeoutMs, exec }) {
  const credentials = ctx.get('credentials')
  const { values, source } = await collectStoredKeys(credentials)
  if (values.length === 0) {
    throw new ExaApiError(
      'exa_' + operation + ': no Exa API key is configured. Add one through the Exa card on the Plugins page or set EXA_API_KEYS / EXA_API_KEY.',
      { code: 'not_configured', operation },
    )
  }
  const state = readManagerState()
  const selected = selectKeyOrder(values, state.strategy, rotation.cursor)
  rotation.cursor = selected.nextCursor
  let last = null
  for (let index = 0; index < selected.order.length; index += 1) {
    const started = Date.now()
    const outcome = await callExaOperation(path, body, selected.order[index], {
      signal: exec !== undefined ? exec.signal : undefined,
      timeoutMs,
      operation,
    })
    if (outcome.kind === 'ok') {
      log(ctx, 'info', 'dsh-exa: %s ok in %dms (%d key(s), source %s)', operation, Date.now() - started, selected.order.length, source)
      return { json: outcome.json, source, strategy: state.strategy, keyCount: selected.order.length }
    }
    last = outcome
    log(ctx, 'info', 'dsh-exa: %s key %d/%d returned HTTP %d', operation, index + 1, selected.order.length, outcome.status)
  }
  const details = []
  if (last !== null && last.requestId !== undefined) details.push('requestId ' + last.requestId)
  if (last !== null && last.tag !== undefined) details.push('tag ' + last.tag)
  if (last !== null && typeof last.message === 'string' && last.message.length > 0) details.push(last.message)
  const suffix = details.length > 0 ? ' — ' + details.join(' — ') : ''
  const statusValue = last !== null ? last.status : 0
  throw new ExaApiError(
    'exa_' + operation + ': all ' + selected.order.length + ' configured key(s) failed with HTTP ' + statusValue + suffix
      + '. A team-level credit or budget failure (HTTP 402) may affect every key in the same team.',
    {
      status: statusValue,
      code: 'all_keys_failed',
      requestId: last !== null ? last.requestId : undefined,
      tag: last !== null ? last.tag : undefined,
      operation,
    },
  )
}

/** Log request warnings host-side; official guidance says not to show them to models. */
export function logWarnings(ctx, operation, json) {
  if (json === null || typeof json !== 'object' || !Array.isArray(json.warnings)) return
  for (const warning of json.warnings) {
    if (warning === null || typeof warning !== 'object') continue
    const code = typeof warning.code === 'string' ? warning.code : 'UNKNOWN'
    const path = typeof warning.path === 'string' ? warning.path : ''
    const message = typeof warning.message === 'string' ? warning.message : ''
    log(ctx, 'warn', 'dsh-exa: %s warning %s %s %s', operation, code, path, message)
  }
}
