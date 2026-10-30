/**
 * Credential resolution and key-list mutation shared by the tools and the
 * management routes.
 *
 * The environment layout is:
 * - EXA_API_KEYS: ordered, comma-separated, authoritative when non-empty;
 * - EXA_API_KEY: single-key fallback, kept in step with the first list item.
 */
import { keyId, maskValue, parseKeyList } from './lib.js'
import { inactiveEntry } from './state.js'

export const API_KEYS_REF = 'EXA_API_KEYS'
export const API_KEY_REF = 'EXA_API_KEY'

export const READONLY_LIST = 'EXA_API_KEYS is supplied read-only by the launching environment. Unset it in the shell that starts dsh, or edit ~/.dsh/.credentials.yaml.'
export const READONLY_PRIMARY = 'EXA_API_KEY is supplied read-only by the launching environment. Unset it in the shell that starts dsh.'

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

/** Build the manager payload's key rows. */
export function keyEntries(values, state, writable) {
  const savedAt = state !== null && state !== undefined && state.keySavedAt !== null && typeof state.keySavedAt === 'object'
    ? state.keySavedAt
    : {}
  // Priority routing starts at the first active key, so the primary marker
  // follows that key rather than a fixed list position.
  const firstActiveIndex = values.findIndex((value) => inactiveEntry(state, keyId(value)) === null)
  return values.map((value, index) => {
    const id = keyId(value)
    const inactive = inactiveEntry(state, id)
    return {
      id,
      masked: maskValue(value),
      primary: index === firstActiveIndex,
      active: inactive === null,
      inactiveReason: inactive === null ? null : inactive.reason,
      inactiveAt: inactive === null ? null : inactive.at,
      savedAt: typeof savedAt[id] === 'string' ? savedAt[id] : null,
      removable: writable.edit,
      editable: writable.edit,
    }
  })
}
