/**
 * Pure helpers shared by the Exa tools and management routes.
 *
 * Nothing here reads or writes credentials; key values are only parsed,
 * masked, fingerprinted, reordered, or validated.
 */
import { createHash } from 'node:crypto'

const KEY_SEPARATOR = /[,\n\r]+/u

/** Split a credential or batch input into trimmed, non-empty, unique keys. */
export function parseKeyList(value) {
  if (typeof value !== 'string') return []
  const seen = new Set()
  const out = []
  for (const part of value.split(KEY_SEPARATOR)) {
    const key = part.trim()
    if (key.length > 0 && !seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  return out
}

/** Accept a string or an array of strings from a management request. */
export function parseKeyInput(value) {
  const parts = Array.isArray(value) ? value : [value]
  const seen = new Set()
  const out = []
  for (const part of parts) {
    if (typeof part !== 'string') continue
    for (const key of parseKeyList(part)) {
      if (!seen.has(key)) {
        seen.add(key)
        out.push(key)
      }
    }
  }
  return out
}

/** Dedupe strings while preserving first-seen order. */
export function dedupe(values) {
  const seen = new Set()
  const out = []
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value === 'string' && !seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

/**
 * Mask a single key for display. Short values are fully hidden; longer values
 * keep only a prefix and suffix fingerprint.
 */
export function maskValue(value) {
  if (typeof value !== 'string' || value.length === 0) return ''
  if (value.length <= 12) return '••••'
  return value.slice(0, 8) + '…' + value.slice(-4)
}

/** Stable non-secret identifier for one key value. */
export function keyId(value) {
  if (typeof value !== 'string' || value.length === 0) return ''
  return 'k_' + createHash('sha256').update(value).digest('hex').slice(0, 16)
}

/** Stable non-secret identifier for a service key value. */
export function serviceId(value) {
  if (typeof value !== 'string' || value.length === 0) return ''
  return 's_' + createHash('sha256').update(value).digest('hex').slice(0, 16)
}

/**
 * Snapshot the starting order for one call.
 *
 * Priority always starts at the first key. Round-robin starts at the shared
 * cursor and advances it exactly once for this call. Both return a fresh array
 * so a later credential write cannot mutate an in-flight order.
 */
export function selectKeyOrder(values, strategy, cursor) {
  const keys = Array.isArray(values) ? values.slice() : []
  if (keys.length === 0) return { order: [], nextCursor: 0 }
  if (strategy !== 'round-robin') {
    return { order: keys, nextCursor: 0 }
  }
  const n = keys.length
  const c = Number.isFinite(cursor) ? Math.trunc(cursor) : 0
  const start = ((c % n) + n) % n
  return {
    order: [...keys.slice(start), ...keys.slice(0, start)],
    nextCursor: (start + 1) % n,
  }
}

/**
 * Apply a client-supplied order of stable IDs. Returns null unless the IDs are
 * exactly the current set, once each, so a reorder cannot add or drop keys.
 */
export function reorderByIds(entries, ids) {
  if (!Array.isArray(entries) || !Array.isArray(ids) || entries.length !== ids.length) return null
  const byId = new Map()
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') return null
    if (byId.has(entry.id)) return null
    byId.set(entry.id, entry)
  }
  const seen = new Set()
  const out = []
  for (const id of ids) {
    if (typeof id !== 'string' || seen.has(id)) return null
    const entry = byId.get(id)
    if (entry === undefined) return null
    seen.add(id)
    out.push(entry)
  }
  return out
}

/** Clamp an integer; invalid or missing input uses the fallback. */
export function clampInt(value, min, max, fallback) {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Parse an integer argument, throwing on missing required values or ranges. */
export function integerArg(args, name, { min, max, fallback, required = false } = {}) {
  if (args[name] === undefined || args[name] === null) {
    if (fallback !== undefined) return fallback
    if (required) throw new Error(name + ' is required')
    return undefined
  }
  const n = args[name]
  if (!Number.isInteger(n)) throw new Error(name + ' must be an integer')
  if (min !== undefined && n < min) throw new Error(name + ' must be at least ' + min)
  if (max !== undefined && n > max) throw new Error(name + ' must be at most ' + max)
  return n
}

/** Parse an optional non-empty string argument. */
export function optionalString(args, name, { maxLength } = {}) {
  if (args[name] === undefined || args[name] === null) return undefined
  if (typeof args[name] !== 'string') throw new Error(name + ' must be a string')
  const value = args[name].trim()
  if (value.length === 0) throw new Error(name + ' must be a non-empty string')
  if (maxLength !== undefined && value.length > maxLength) {
    throw new Error(name + ' must be at most ' + maxLength + ' characters')
  }
  return value
}

/** Parse an optional array of non-empty strings. */
export function optionalStringArray(args, name, { maxItems, maxLength } = {}) {
  if (args[name] === undefined || args[name] === null) return undefined
  if (!Array.isArray(args[name])) throw new Error(name + ' must be an array of strings')
  if (maxItems !== undefined && args[name].length > maxItems) {
    throw new Error(name + ' must contain at most ' + maxItems + ' items')
  }
  return args[name].map((value, index) => {
    if (typeof value !== 'string') throw new Error(name + '[' + index + '] must be a string')
    const trimmed = value.trim()
    if (trimmed.length === 0) throw new Error(name + '[' + index + '] must be a non-empty string')
    if (maxLength !== undefined && trimmed.length > maxLength) {
      throw new Error(name + '[' + index + '] must be at most ' + maxLength + ' characters')
    }
    return trimmed
  })
}

/** Parse an optional boolean argument. */
export function optionalBoolean(args, name) {
  if (args[name] === undefined || args[name] === null) return undefined
  if (typeof args[name] !== 'boolean') throw new Error(name + ' must be a boolean')
  return args[name]
}

/** Parse an optional enum string. */
export function optionalEnum(args, name, allowed) {
  if (args[name] === undefined || args[name] === null) return undefined
  if (typeof args[name] !== 'string' || !allowed.includes(args[name])) {
    throw new Error(name + ' must be one of ' + allowed.join(', '))
  }
  return args[name]
}

/** Require a non-empty string argument. */
export function requiredString(args, name, { maxLength } = {}) {
  if (typeof args[name] !== 'string' || args[name].trim().length === 0) {
    throw new Error(name + ' must be a non-empty string')
  }
  const value = args[name].trim()
  if (maxLength !== undefined && value.length > maxLength) {
    throw new Error(name + ' must be at most ' + maxLength + ' characters')
  }
  return value
}

/** Validate an absolute HTTP(S) URL and return its trimmed text. */
export function requiredHttpUrl(value, name) {
  if (typeof value !== 'string') throw new Error(name + ' must be an absolute HTTP(S) URL')
  const text = value.trim()
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error(name + ' must be an absolute HTTP(S) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(name + ' must use HTTP or HTTPS')
  }
  return text
}

/** Require an array of absolute HTTP(S) URLs, deduped in first-seen order. */
export function requiredHttpUrls(value, name, { min = 1, max = 20 } = {}) {
  if (!Array.isArray(value) || value.length < min) {
    throw new Error(name + ' must contain at least ' + min + ' URL')
  }
  if (value.length > max) throw new Error(name + ' must contain at most ' + max + ' URLs')
  const seen = new Set()
  const out = []
  value.forEach((item, index) => {
    const url = requiredHttpUrl(item, name + '[' + index + ']')
    if (!seen.has(url)) {
      seen.add(url)
      out.push(url)
    }
  })
  return out
}

/** Parse a date-only or ISO 8601 date-time. Returns null when invalid. */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length === 0) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text)
  if (dateOnly !== null) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const ms = Date.UTC(year, month - 1, day)
    const date = new Date(ms)
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return { ms, dateOnly: true }
  }
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) return null
  return { ms, dateOnly: false }
}

/** Require a valid ISO 8601 date or date-time and return its original text. */
export function requiredIsoDate(value, name) {
  const parsed = parseIsoDate(value)
  if (parsed === null) throw new Error(name + ' must be an ISO 8601 date or date-time')
  return value.trim()
}

/** UTC date-only string for a millisecond timestamp. */
export function dateOnlyFromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Start of the UTC day containing the timestamp. */
export function startOfUtcDay(ms) {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Validate the usage date range. Defaults are the most recent 30 days; the
 * earliest allowed start is 180 days before now. Dates are normalized to UTC
 * calendar days because the Team Management usage API accepts date-only values.
 */
export function validateUsageRange(startValue, endValue, now = new Date()) {
  const nowMs = now.getTime()
  const endParsed = endValue === undefined || endValue === null || endValue === ''
    ? { ms: startOfUtcDay(nowMs) }
    : parseIsoDate(endValue)
  if (endParsed === null) {
    return { ok: false, code: 'invalid_range', message: 'end_date must be an ISO 8601 date' }
  }
  const endMs = startOfUtcDay(endParsed.ms)
  const startParsed = startValue === undefined || startValue === null || startValue === ''
    ? { ms: endMs - 30 * 86400000 }
    : parseIsoDate(startValue)
  if (startParsed === null) {
    return { ok: false, code: 'invalid_range', message: 'start_date must be an ISO 8601 date' }
  }
  const startMs = startOfUtcDay(startParsed.ms)
  if (startMs > endMs) {
    return { ok: false, code: 'range_reversed', message: 'start_date must not be after end_date' }
  }
  const oldestMs = startOfUtcDay(nowMs - 180 * 86400000)
  if (startMs < oldestMs) {
    return { ok: false, code: 'range_too_old', message: 'start_date must be within the last 180 days' }
  }
  return { ok: true, startDate: dateOnlyFromMs(startMs), endDate: dateOnlyFromMs(endMs) }
}

/** Truncate text with an explicit marker. */
export function truncateText(value, max) {
  if (typeof value !== 'string') return undefined
  if (value.length <= max) return value
  return value.slice(0, max) + '\n…[truncated]'
}

/** Convert a numeric value only when it is finite. */
export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Convert an array of finite numbers, dropping other items. */
export function finiteNumbers(value) {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((item) => typeof item === 'number' && Number.isFinite(item))
  return out.length === value.length ? out : out.length > 0 ? out : undefined
}
