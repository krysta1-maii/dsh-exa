/** Shared fakes for unit tests. No network or DSH runtime is required. */
import { Readable } from 'node:stream'

/** In-memory credentials service mirroring the Host contract used here. */
export function makeCredentials({ refs = {}, writable = {}, sources = {} } = {}) {
  const store = new Map(Object.entries(refs))
  const writableMap = new Map(Object.entries(writable))
  const sourceMap = new Map(Object.entries(sources))
  return {
    store,
    async resolve(ref) {
      const value = store.get(ref)
      if (value === undefined || value === null || value.length === 0) return undefined
      return { value, source: sourceMap.get(ref) || 'file' }
    },
    async describe(ref) {
      const value = store.get(ref)
      return {
        configured: value !== undefined && value !== null && value.length > 0,
        source: sourceMap.get(ref),
        writable: writableMap.get(ref) !== false,
      }
    },
    async set(ref, value) {
      if (writableMap.get(ref) === false) throw new Error(ref + ' is read-only')
      if (typeof value !== 'string' || value.length === 0) throw new Error('empty credential')
      store.set(ref, value)
      sourceMap.set(ref, 'file')
    },
    async unset(ref) {
      if (writableMap.get(ref) === false) throw new Error(ref + ' is read-only')
      store.delete(ref)
      sourceMap.delete(ref)
    },
    setWritable(ref, value) {
      writableMap.set(ref, value)
    },
    setSource(ref, value) {
      sourceMap.set(ref, value)
    },
  }
}

/** Minimal Host context that records tools, prompt sections, routes, and effects. */
export function makeCtx({ credentials, logger } = {}) {
  const tools = new Map()
  const sections = new Map()
  const routes = new Map()
  const effects = []
  const ctx = {
    get(name) {
      if (name === 'credentials') return credentials
      if (name === 'systemPrompt') {
        return {
          section(section) {
            sections.set(section.name, section)
            return () => sections.delete(section.name)
          },
        }
      }
      return undefined
    },
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    webServer: {
      register(route) {
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
    effect(callback) {
      const dispose = callback()
      effects.push(dispose)
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    logger: logger || {
      info() {},
      warn() {},
      error() {},
    },
  }
  return { ctx, tools, sections, routes, effects }
}

/** Call a plugin route with an optional JSON body. */
export async function callRoute(handler, method, url, body) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  request.method = method
  request.url = url
  const response = {
    statusCode: 0,
    headers: {},
    payload: '',
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers || {}
      return this
    },
    end(chunk) {
      this.payload += chunk === undefined ? '' : String(chunk)
    },
  }
  await handler(request, response)
  return {
    status: response.statusCode,
    headers: response.headers,
    body: response.payload.length === 0 ? null : JSON.parse(response.payload),
  }
}

/** Minimal fetch Response replacement with case-insensitive headers. */
export function fakeResponse(body, options = {}) {
  const { status = 200, headers = {} } = typeof options === 'number' ? { status: options } : options
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return lower.get(String(name).toLowerCase()) ?? null
      },
    },
    async text() {
      return text
    },
    async json() {
      return JSON.parse(text)
    },
  }
}

/** Create a fetch stub and a call record. */
export function makeFetch(handler) {
  const calls = []
  const fetch = async (url, init = {}) => {
    const record = { url: String(url), init }
    calls.push(record)
    return handler(record, calls.length)
  }
  return { fetch, calls }
}
