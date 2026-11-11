/**
 * Exa HTTP transport, error classification, key failover, and warning logging.
 *
 * Failover is deliberately narrow: only 401, 402, and 429 move to another
 * key. A 402 additionally marks that key inactive, because it means exhausted
 * credits or a key or team budget being exceeded; the key stays out of routing
 * until a user re-enables it in the management card. Timeouts, caller
 * cancellation, and network failures are surfaced immediately.
 */
import { collectStoredKeys } from './key-manager.js'
import { keyId, selectKeyOrder } from './lib.js'
import { isKeyInactive, readManagerState, updateManagerState } from './state.js'

export const EXA_BASE_URL = 'https://api.exa.ai'
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
      'user-agent': 'dsh-exa/0.4.2',
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

/** Mark one key inactive after Exa reports HTTP 402. */
function markKeyInactive(ctx, operation, id) {
  try {
    updateManagerState((state) => {
      state.inactiveKeys[id] = { reason: 'http_402', at: new Date().toISOString() }
      return state
    })
    log(ctx, 'info', 'dsh-exa: %s marked one key inactive after HTTP 402', operation)
  } catch (error) {
    log(
      ctx,
      'warn',
      'dsh-exa: could not mark a key inactive after HTTP 402: %s',
      error instanceof Error ? error.message : String(error),
    )
  }
}

/**
 * The model-facing 402 used when no configured key may be tried.
 *
 * Exa itself returns 402 for exhausted credits and exceeded budgets. Once
 * every key is inactive there is no request left to make, so the tool reports
 * the same status and points at the Billing dashboard and the key card.
 */
function paymentRequiredError(operation, last) {
  const details = []
  if (last !== null && last !== undefined) {
    if (last.requestId !== undefined) details.push('requestId ' + last.requestId)
    if (last.tag !== undefined) details.push('tag ' + last.tag)
    if (typeof last.message === 'string' && last.message.length > 0) details.push(last.message)
  }
  const suffix = details.length > 0 ? ' — ' + details.join(' — ') : ''
  const afterPaymentFailure = last !== null && last !== undefined
  const remediation = afterPaymentFailure
    ? 'Add credits at https://dashboard.exa.ai/billing and re-enable at least one key in the Exa card on the Plugins page.'
    : 'Re-enable at least one key in the Exa card on the Plugins page; if a previous HTTP 402 exhausted credits or a budget, add credits at https://dashboard.exa.ai/billing.'
  return new ExaApiError(
    'exa_' + operation + ': HTTP 402 — payment required. All configured Exa API keys are inactive'
      + (afterPaymentFailure ? ' after an HTTP 402 response' : '') + suffix + '. ' + remediation,
    {
      status: 402,
      code: 'payment_required',
      requestId: last !== null && last !== undefined ? last.requestId : undefined,
      tag: last !== null && last !== undefined ? last.tag : undefined,
      operation,
    },
  )
}

/**
 * Run one operation through the configured key order.
 *
 * The order is snapshotted before the first request. Only active keys enter
 * that order; every distinct key is tried at most once. The round-robin cursor
 * advances once per call, even when the first key succeeds. A 402 disables the
 * key that produced it; when that leaves no active key, the call ends with an
 * HTTP 402 payment-required error instead of an aggregate failure.
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
  const activeFlags = values.map((value) => !isKeyInactive(state, keyId(value)))
  const selected = selectKeyOrder(values, state.strategy, rotation.cursor, activeFlags)
  rotation.cursor = selected.nextCursor
  if (selected.order.length === 0) {
    log(ctx, 'warn', 'dsh-exa: %s skipped because every configured key is inactive', operation)
    throw paymentRequiredError(operation, null)
  }
  const attempted = selected.order.map((value) => ({ id: keyId(value), active: true }))
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
    if (outcome.status === 402) {
      markKeyInactive(ctx, operation, attempted[index].id)
      attempted[index].active = false
      if (attempted.every((item) => !item.active)) {
        throw paymentRequiredError(operation, outcome)
      }
    }
  }
  const details = []
  if (last !== null && last.requestId !== undefined) details.push('requestId ' + last.requestId)
  if (last !== null && last.tag !== undefined) details.push('tag ' + last.tag)
  if (last !== null && typeof last.message === 'string' && last.message.length > 0) details.push(last.message)
  const suffix = details.length > 0 ? ' — ' + details.join(' — ') : ''
  const statusValue = last !== null ? last.status : 0
  throw new ExaApiError(
    'exa_' + operation + ': all ' + selected.order.length + ' active key(s) failed with HTTP ' + statusValue + suffix
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
