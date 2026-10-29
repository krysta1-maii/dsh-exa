/**
 * Exa Team Management adapter with a short cache and in-flight de-duplication.
 *
 * Only GET endpoints are used. The service key is never used for search or
 * contents requests, and cache keys contain a service-key fingerprint plus the
 * Admin key ID and requested range, never the secret itself.
 */
import { callAdminApi, ExaApiError } from './exa-client.js'
import { finiteNumber, serviceId } from './lib.js'

/** Map an Admin API failure onto a stable, user-facing code. */
export function adminErrorCode(error) {
  if (error instanceof ExaApiError) {
    if (error.code === 'network' || error.code === 'timeout' || error.code === 'cancelled') return 'admin_unreachable'
    if (error.status === 401) return 'admin_unauthorized'
    if (error.status === 403) return 'admin_forbidden'
    if (error.status === 404) return 'admin_not_found'
    if (error.status === 400) return 'invalid_range'
  }
  return 'admin_error'
}

/** Normalize the list-keys response shapes documented by Exa. */
export function normalizeTeamKeys(json) {
  const raw = Array.isArray(json)
    ? json
    : Array.isArray(json?.apiKeys)
      ? json.apiKeys
      : json?.apiKey !== null && json?.apiKey !== undefined && typeof json.apiKey === 'object'
        ? [json.apiKey]
        : []
  return raw.flatMap((item) => {
    if (item === null || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length === 0) return []
    return [{
      id: item.id,
      name: typeof item.name === 'string' && item.name.length > 0 ? item.name : null,
      rateLimit: Number.isInteger(item.rateLimit) ? item.rateLimit : null,
      budgetCents: Number.isInteger(item.budgetCents) ? item.budgetCents : null,
      isOverBudget: item.isOverBudget === true,
    }]
  })
}

/** Normalize one usage response. */
export function normalizeUsage(json) {
  const breakdown = Array.isArray(json?.cost_breakdown)
    ? json.cost_breakdown.flatMap((item) => {
      if (item === null || typeof item !== 'object') return []
      const quantity = finiteNumber(item.quantity) ?? 0
      const amountUsd = finiteNumber(item.amount_usd) ?? 0
      return [{
        priceId: typeof item.price_id === 'string' ? item.price_id : '',
        priceName: typeof item.price_name === 'string' ? item.price_name : '',
        quantity,
        amountUsd,
      }]
    })
    : []
  return {
    adminKeyId: typeof json?.api_key_id === 'string'
      ? json.api_key_id
      : typeof json?.id === 'string' ? json.id : null,
    apiKeyName: typeof json?.api_key_name === 'string' ? json.api_key_name : null,
    totalCostUsd: finiteNumber(json?.total_cost_usd) ?? 0,
    costBreakdown: breakdown,
    period: {
      start: typeof json?.period?.start === 'string' ? json.period.start : null,
      end: typeof json?.period?.end === 'string' ? json.period.end : null,
    },
  }
}

/**
 * Create a per-plugin-installation usage client so caches are cleared with the
 * owning fiber instead of surviving in module scope.
 */
export function createUsageClient({ ttlMs = 60000, now = () => Date.now() } = {}) {
  const cache = new Map()
  const inflight = new Map()

  function fresh(entry) {
    return entry !== undefined && now() - entry.at < ttlMs
  }

  async function cached(key, refresh, load) {
    if (!refresh) {
      const entry = cache.get(key)
      if (fresh(entry)) return entry.value
    }
    const pending = inflight.get(key)
    if (pending !== undefined) return pending
    const promise = Promise.resolve().then(load).then((value) => {
      cache.set(key, { at: now(), value })
      return value
    }).finally(() => {
      inflight.delete(key)
    })
    inflight.set(key, promise)
    return promise
  }

  async function getTeamKeys(serviceKey, { refresh = false, signal } = {}) {
    const hash = serviceId(serviceKey)
    return cached('team|' + hash, refresh, async () => {
      const json = await callAdminApi('/api-keys', serviceKey, {
        signal,
        timeoutMs: 15000,
        operation: 'admin_list_keys',
      })
      return normalizeTeamKeys(json)
    })
  }

  async function getUsage(serviceKey, adminKeyId, range, { refresh = false, signal } = {}) {
    const hash = serviceId(serviceKey)
    const key = 'usage|' + hash + '|' + adminKeyId + '|' + range.startDate + '|' + range.endDate
    return cached(key, refresh, async () => {
      const json = await callAdminApi('/api-keys/' + encodeURIComponent(adminKeyId) + '/usage', serviceKey, {
        signal,
        timeoutMs: 15000,
        operation: 'admin_key_usage',
        query: { start_date: range.startDate, end_date: range.endDate },
      })
      return normalizeUsage(json)
    })
  }

  /** Drop every cached value and stop treating in-flight work as reusable. */
  function clear() {
    cache.clear()
    inflight.clear()
  }

  return { getTeamKeys, getUsage, clear }
}
