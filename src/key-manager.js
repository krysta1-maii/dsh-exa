/**
 * Credential resolution and key-list mutation shared by the tools and the
 * management routes.
 *
 * The environment layout is:
 * - EXA_API_KEYS: ordered, comma-separated, authoritative when non-empty;
 * - EXA_API_KEY: single-key fallback, kept in step with the first list item;
 * - EXA_SERVICE_API_KEY: optional Team Management service key, never used for
 *   search or contents calls.
 */
import { keyId, maskValue, parseKeyList, serviceId } from './lib.js'

export const API_KEYS_REF = 'EXA_API_KEYS'
export const API_KEY_REF = 'EXA_API_KEY'
export const SERVICE_KEY_REF = 'EXA_SERVICE_API_KEY'

export const READONLY_LIST = 'EXA_API_KEYS is supplied read-only by the launching environment. Unset it in the shell that starts dsh, or edit ~/.dsh/.credentials.yaml.'
export const READONLY_PRIMARY = 'EXA_API_KEY is supplied read-only by the launching environment. Unset it in the shell that starts dsh.'
export const READONLY_SERVICE = 'EXA_SERVICE_API_KEY is supplied read-only by the launching environment. Unset it in the shell that starts dsh.'

/** Resolve one credential ref to its current string value, or null. */
export async function resolveRef(credentials, ref) {
  if (credentials === undefined || credentials === null) return null
  const hit = await credentials.resolve(ref)
  return hit !== undefined && hit !== null && typeof hit.value === 'string' && hit.value.length > 0
    ? hit.value
    : null
}

/**
 * Describe one ref without exposing its value. Unknown services are treated as
 * writable so a caller can attempt the write and report its own failure.
 */
export async function describeRef(credentials, ref) {
  if (credentials === undefined || credentials === null) {
    return { configured: false, source: undefined, writable: true }
  }
  try {
    const info = await credentials.describe(ref)
    return {
      configured: info !== undefined && info !== null && info.configured === true,
      source: info !== undefined && info !== null && typeof info.source === 'string' ? info.source : undefined,
      writable: info === undefined || info === null || info.writable !== false,
    }
  } catch {
    return { configured: false, source: undefined, writable: true }
  }
}

/** The authoritative key list and the ref it came from. */
export async function collectStoredKeys(credentials) {
  const fromList = parseKeyList(await resolveRef(credentials, API_KEYS_REF) ?? '')
  if (fromList.length > 0) return { values: fromList, source: 'list' }
  const fromPrimary = parseKeyList(await resolveRef(credentials, API_KEY_REF) ?? '')
  return { values: fromPrimary, source: fromPrimary.length > 0 ? 'primary' : 'none' }
}

/** Whether a ref may be written from this process. */
export async function refWritable(credentials, ref) {
  return (await describeRef(credentials, ref)).writable
}

/** Best-effort sync of EXA_API_KEY to the first list item. */
export async function syncPrimary(credentials, value) {
  if (!(await refWritable(credentials, API_KEY_REF))) return false
  try {
    if (value === null) await credentials.unset(API_KEY_REF)
    else await credentials.set(API_KEY_REF, value)
    return true
  } catch {
    return false
  }
}

/**
 * Write the effective key list. The caller has already checked permissions and
 * must pass the source that was read so the single-primary fallback can be
 * updated without creating an EXA_API_KEYS list that the environment owns.
 */
export async function writeStoredKeys(credentials, values, { source, listWritable, primaryWritable }) {
  if (values.length === 0) {
    if (source === 'primary') {
      if (!primaryWritable) throw new Error(READONLY_PRIMARY)
      await credentials.unset(API_KEY_REF)
      return
    }
    if (!listWritable) throw new Error(READONLY_LIST)
    await credentials.unset(API_KEYS_REF)
    if (primaryWritable) await syncPrimary(credentials, null)
    return
  }

  if (source === 'primary' && !listWritable && values.length === 1) {
    if (!primaryWritable) throw new Error(READONLY_PRIMARY)
    await credentials.set(API_KEY_REF, values[0])
    return
  }

  if (!listWritable) throw new Error(READONLY_LIST)
  await credentials.set(API_KEYS_REF, values.join(','))
  // The list is authoritative; a read-only derived primary must never make the
  // list write look like a failure.
  if (primaryWritable) await syncPrimary(credentials, values[0])
}

/** Read the optional service key, trimming accidental surrounding whitespace. */
export async function collectServiceKey(credentials) {
  const value = await resolveRef(credentials, SERVICE_KEY_REF)
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Display facts for the service key, without its value. */
export async function describeServiceKey(credentials, state) {
  const value = await collectServiceKey(credentials)
  const info = await describeRef(credentials, SERVICE_KEY_REF)
  return {
    configured: typeof value === 'string' && value.length > 0,
    id: value === null ? '' : serviceId(value),
    masked: value === null ? '' : maskValue(value),
    savedAt: state !== null && state !== undefined && typeof state.serviceKeySavedAt === 'string'
      ? state.serviceKeySavedAt
      : null,
    writable: info.writable,
    source: info.source,
  }
}

/** Build the manager payload's key rows. */
export function keyEntries(values, state, writable) {
  const savedAt = state !== null && state !== undefined && state.keySavedAt !== null && typeof state.keySavedAt === 'object'
    ? state.keySavedAt
    : {}
  const adminKeyIds = state !== null && state !== undefined && state.adminKeyIds !== null && typeof state.adminKeyIds === 'object'
    ? state.adminKeyIds
    : {}
  return values.map((value, index) => {
    const id = keyId(value)
    return {
      id,
      masked: maskValue(value),
      primary: index === 0,
      savedAt: typeof savedAt[id] === 'string' ? savedAt[id] : null,
      adminKeyId: typeof adminKeyIds[id] === 'string' ? adminKeyIds[id] : null,
      removable: writable.edit,
      editable: writable.edit,
    }
  })
}
