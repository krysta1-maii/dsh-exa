/**
 * The three model tools: exa_search, exa_search_advanced, and exa_fetch.
 *
 * Argument validation and request-body mapping live in this module so the
 * HTTP client only sees a complete Exa body. Successful bodies are projected
 * onto the declared canonical output schemas; PTC callers receive that value
 * directly and native callers receive the rendered content.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { logWarnings, performWithFailover } from './exa-client.js'
import {
  finiteNumber,
  finiteNumbers,
  integerArg,
  optionalBoolean,
  optionalEnum,
  optionalString,
  optionalStringArray,
  parseIsoDate,
  requiredHttpUrls,
  requiredIsoDate,
  requiredString,
  truncateText,
} from './lib.js'

const MAX_ADVANCED_TEXT = 50000
const MAX_CONTEXT_TEXT = 100000
const MAX_HIGHLIGHT_TEXT = 8000
const MAX_FETCH_TEXT = 50000
const MAX_FETCH_URLS = 20

const LITE_UNSUPPORTED = [
  'startCrawlDate',
  'endCrawlDate',
  'includeText',
  'excludeText',
  'additionalQueries',
  'contextMaxCharacters',
  'maxAgeHours',
  'livecrawlTimeout',
  'subpages',
  'subpageTarget',
]

function validateDateRange(startField, endField, args) {
  const start = args[startField] === undefined || args[startField] === null
    ? undefined
    : requiredIsoDate(args[startField], startField)
  const end = args[endField] === undefined || args[endField] === null
    ? undefined
    : requiredIsoDate(args[endField], endField)
  if (start !== undefined && end !== undefined) {
    const startMs = parseIsoDate(start).ms
    const endMs = parseIsoDate(end).ms
    if (startMs > endMs) throw new Error(startField + ' must not be after ' + endField)
  }
  return { start, end }
}

/** Normalize exa_search arguments. */
export function normalizeSimpleArgs(args) {
  return {
    query: requiredString(args, 'query', { maxLength: 4096 }),
    numResults: integerArg(args, 'numResults', { min: 1, max: 20, fallback: 10 }),
  }
}

/** Build the fixed simple-search body: auto type plus highlights. */
export function buildSimpleBody(input) {
  return {
    query: input.query,
    type: 'auto',
    numResults: input.numResults,
    contents: { highlights: true },
  }
}

function optionalSubpageTarget(args) {
  if (args.subpageTarget === undefined || args.subpageTarget === null) return undefined
  if (typeof args.subpageTarget === 'string') {
    const value = args.subpageTarget.trim()
    if (value.length === 0) throw new Error('subpageTarget must be a non-empty string or array of strings')
    if (value.length > 100) throw new Error('subpageTarget entries must be at most 100 characters')
    return value
  }
  if (!Array.isArray(args.subpageTarget)) throw new Error('subpageTarget must be a string or array of strings')
  if (args.subpageTarget.length > 100) throw new Error('subpageTarget must contain at most 100 entries')
  const out = args.subpageTarget.map((value, index) => {
    if (typeof value !== 'string') throw new Error('subpageTarget[' + index + '] must be a string')
    const trimmed = value.trim()
    if (trimmed.length === 0) throw new Error('subpageTarget[' + index + '] must be non-empty')
    if (trimmed.length > 100) throw new Error('subpageTarget[' + index + '] must be at most 100 characters')
    return trimmed
  })
  return out
}

/** Normalize exa_search_advanced arguments and enforce lite compatibility. */
export function normalizeAdvancedArgs(args) {
  const query = requiredString(args, 'query', { maxLength: 4096 })
  const numResults = integerArg(args, 'numResults', { min: 1, max: 100, fallback: 10 })
  const type = optionalEnum(args, 'type', ['auto', 'lite']) ?? 'auto'
  const category = optionalString(args, 'category', { maxLength: 120 })
  const includeDomains = optionalStringArray(args, 'includeDomains', { maxItems: 1200, maxLength: 2048 })
  const excludeDomains = optionalStringArray(args, 'excludeDomains', { maxItems: 1200, maxLength: 2048 })
  const published = validateDateRange('startPublishedDate', 'endPublishedDate', args)
  const crawled = validateDateRange('startCrawlDate', 'endCrawlDate', args)
  const includeText = optionalStringArray(args, 'includeText', { maxItems: 50, maxLength: 4096 })
  const excludeText = optionalStringArray(args, 'excludeText', { maxItems: 50, maxLength: 4096 })
  const userLocation = optionalString(args, 'userLocation', { maxLength: 64 })
  const moderation = optionalBoolean(args, 'moderation')
  const additionalQueries = optionalStringArray(args, 'additionalQueries', { maxItems: 10, maxLength: 4096 })
  const textMaxCharacters = integerArg(args, 'textMaxCharacters', { min: 1, max: MAX_ADVANCED_TEXT })
  const contextMaxCharacters = integerArg(args, 'contextMaxCharacters', { min: 1, max: MAX_CONTEXT_TEXT })
  const enableSummary = optionalBoolean(args, 'enableSummary')
  const summaryQuery = optionalString(args, 'summaryQuery', { maxLength: 4096 })
  const enableHighlights = optionalBoolean(args, 'enableHighlights')
  const highlightsMaxCharacters = integerArg(args, 'highlightsMaxCharacters', { min: 1, max: MAX_HIGHLIGHT_TEXT })
  const highlightsQuery = optionalString(args, 'highlightsQuery', { maxLength: 4096 })
  const maxAgeHours = integerArg(args, 'maxAgeHours', { min: -1, max: 720 })
  const livecrawlTimeout = integerArg(args, 'livecrawlTimeout', { min: 1, max: 90000 })
  const subpages = integerArg(args, 'subpages', { min: 0, max: 100 })
  const subpageTarget = optionalSubpageTarget(args)

  if (summaryQuery !== undefined && enableSummary !== true) {
    throw new Error('summaryQuery requires enableSummary: true')
  }
  if ((highlightsMaxCharacters !== undefined || highlightsQuery !== undefined) && enableHighlights === false) {
    throw new Error('highlightsMaxCharacters and highlightsQuery cannot be used when enableHighlights is false')
  }
  if (subpageTarget !== undefined && (subpages === undefined || subpages === 0)) {
    throw new Error('subpageTarget requires subpages greater than 0')
  }
  if (category === 'company' && (published.start !== undefined || published.end !== undefined)) {
    throw new Error('category company does not support startPublishedDate or endPublishedDate')
  }
  if (category === 'people') {
    if (published.start !== undefined || published.end !== undefined) {
      throw new Error('category people does not support startPublishedDate or endPublishedDate')
    }
    if (excludeDomains !== undefined) throw new Error('category people does not support excludeDomains')
  }

  if (type === 'lite') {
    const used = LITE_UNSUPPORTED.filter((name) => args[name] !== undefined && args[name] !== null)
    if (args.enableSummary === true) used.push('enableSummary')
    if (summaryQuery !== undefined) used.push('summaryQuery')
    if (subpages !== undefined && subpages > 0) used.push('subpages')
    if (used.length > 0) {
      throw new Error('type lite does not support: ' + [...new Set(used)].join(', '))
    }
  }

  return {
    query,
    numResults,
    type,
    category,
    includeDomains,
    excludeDomains,
    startPublishedDate: published.start,
    endPublishedDate: published.end,
    startCrawlDate: crawled.start,
    endCrawlDate: crawled.end,
    includeText,
    excludeText,
    userLocation,
    moderation,
    additionalQueries,
    textMaxCharacters,
    contextMaxCharacters,
    enableSummary: enableSummary === true,
    summaryQuery,
    enableHighlights: enableHighlights !== false,
    highlightsMaxCharacters,
    highlightsQuery,
    maxAgeHours,
    livecrawlTimeout,
    subpages,
    subpageTarget,
  }
}

/** Build the nested Exa search request body. */
export function buildAdvancedBody(input) {
  const body = { query: input.query, type: input.type, numResults: input.numResults }
  if (input.category !== undefined) body.category = input.category
  if (input.includeDomains !== undefined) body.includeDomains = input.includeDomains
  if (input.excludeDomains !== undefined) body.excludeDomains = input.excludeDomains
  if (input.startPublishedDate !== undefined) body.startPublishedDate = input.startPublishedDate
  if (input.endPublishedDate !== undefined) body.endPublishedDate = input.endPublishedDate
  if (input.startCrawlDate !== undefined) body.startCrawlDate = input.startCrawlDate
  if (input.endCrawlDate !== undefined) body.endCrawlDate = input.endCrawlDate
  if (input.includeText !== undefined) body.includeText = input.includeText
  if (input.excludeText !== undefined) body.excludeText = input.excludeText
  if (input.userLocation !== undefined) body.userLocation = input.userLocation
  if (input.moderation !== undefined) body.moderation = input.moderation
  if (input.additionalQueries !== undefined) body.additionalQueries = input.additionalQueries

  const contents = {}
  if (input.enableHighlights) {
    const highlights = {}
    if (input.highlightsMaxCharacters !== undefined) highlights.maxCharacters = input.highlightsMaxCharacters
    if (input.highlightsQuery !== undefined) highlights.query = input.highlightsQuery
    contents.highlights = Object.keys(highlights).length > 0 ? highlights : true
  }
  if (input.textMaxCharacters !== undefined) contents.text = { maxCharacters: input.textMaxCharacters }
  if (input.contextMaxCharacters !== undefined) contents.context = { maxCharacters: input.contextMaxCharacters }
  if (input.enableSummary) contents.summary = input.summaryQuery === undefined ? {} : { query: input.summaryQuery }
  if (input.maxAgeHours !== undefined) contents.maxAgeHours = input.maxAgeHours
  if (input.livecrawlTimeout !== undefined) contents.livecrawlTimeout = input.livecrawlTimeout
  if (input.subpages !== undefined) contents.subpages = input.subpages
  if (input.subpageTarget !== undefined) contents.subpageTarget = input.subpageTarget
  if (Object.keys(contents).length > 0) body.contents = contents
  return body
}

/** Normalize exa_fetch arguments. */
export function normalizeFetchArgs(args) {
  return {
    urls: requiredHttpUrls(args.urls, 'urls', { min: 1, max: MAX_FETCH_URLS }),
    maxCharacters: integerArg(args, 'maxCharacters', { min: 1, max: MAX_FETCH_TEXT, fallback: 3000 }),
  }
}

/** Build the Exa contents request body. */
export function buildFetchBody(input) {
  return { urls: input.urls, text: { maxCharacters: input.maxCharacters } }
}

function projectCost(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out = {}
  const total = finiteNumber(value.total)
  if (total !== undefined) out.total = total
  if (value.search !== null && typeof value.search === 'object' && !Array.isArray(value.search)) {
    const search = {}
    const neural = finiteNumber(value.search.neural)
    const keyword = finiteNumber(value.search.keyword)
    if (neural !== undefined) search.neural = neural
    if (keyword !== undefined) search.keyword = keyword
    if (Object.keys(search).length > 0) out.search = search
  }
  const summary = finiteNumber(value.summary)
  if (summary !== undefined) out.summary = summary
  if (value.contents !== null && typeof value.contents === 'object' && !Array.isArray(value.contents)) {
    const contents = {}
    const text = finiteNumber(value.contents.text)
    const highlights = finiteNumber(value.contents.highlights)
    const summaryCost = finiteNumber(value.contents.summary)
    if (text !== undefined) contents.text = text
    if (highlights !== undefined) contents.highlights = highlights
    if (summaryCost !== undefined) contents.summary = summaryCost
    if (Object.keys(contents).length > 0) out.contents = contents
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function projectStringArray(value, max) {
  if (!Array.isArray(value)) return undefined
  const out = value.flatMap((item) => typeof item === 'string' ? [truncateText(item, max)] : [])
  return out.length > 0 ? out : undefined
}

function projectSubpages(value) {
  if (!Array.isArray(value)) return undefined
  const out = value.flatMap((item) => {
    if (item === null || typeof item !== 'object') return []
    const url = typeof item.url === 'string' && item.url.length > 0 ? item.url : undefined
    if (url === undefined) return []
    const title = typeof item.title === 'string' && item.title.length > 0 ? item.title : url
    const page = { title, url }
    if (typeof item.id === 'string') page.id = item.id
    if (typeof item.publishedDate === 'string') page.publishedDate = item.publishedDate
    if (typeof item.author === 'string') page.author = item.author
    return [page]
  })
  return out.length > 0 ? out : undefined
}

/** Project one search result onto the canonical schema. */
export function projectSearchResult(result) {
  if (result === null || typeof result !== 'object') return undefined
  const url = typeof result.url === 'string' && result.url.length > 0
    ? result.url
    : typeof result.id === 'string' && /^https?:\/\//u.test(result.id) ? result.id : undefined
  if (url === undefined) return undefined
  const item = {
    title: typeof result.title === 'string' && result.title.length > 0 ? result.title : url,
    url,
  }
  if (typeof result.id === 'string' && result.id.length > 0) item.id = result.id
  if (typeof result.author === 'string' && result.author.length > 0) item.author = result.author
  if (typeof result.publishedDate === 'string' && result.publishedDate.length > 0) item.publishedDate = result.publishedDate
  const score = finiteNumber(result.score)
  if (score !== undefined) item.score = score
  const highlights = projectStringArray(result.highlights, MAX_HIGHLIGHT_TEXT)
  if (highlights !== undefined) item.highlights = highlights
  const highlightScores = finiteNumbers(result.highlightScores)
  if (highlightScores !== undefined) item.highlightScores = highlightScores
  if (typeof result.summary === 'string' && result.summary.length > 0) item.summary = truncateText(result.summary, MAX_HIGHLIGHT_TEXT)
  if (typeof result.text === 'string' && result.text.length > 0) item.text = truncateText(result.text, MAX_ADVANCED_TEXT)
  const subpages = projectSubpages(result.subpages)
  if (subpages !== undefined) item.subpages = subpages
  return item
}

function projectNotices(value) {
  if (!Array.isArray(value)) return undefined
  const out = value.flatMap((item) => {
    if (item === null || typeof item !== 'object') return []
    if (typeof item.code !== 'string' || typeof item.message !== 'string') return []
    return [{
      code: item.code,
      path: typeof item.path === 'string' ? item.path : '',
      message: item.message,
    }]
  })
  return out.length > 0 ? out : undefined
}

/** Project a search response. */
export function projectSearchResponse(json) {
  const out = {
    results: Array.isArray(json?.results) ? json.results.flatMap((item) => {
      const result = projectSearchResult(item)
      return result === undefined ? [] : [result]
    }) : [],
  }
  if (typeof json?.requestId === 'string' && json.requestId.length > 0) out.requestId = json.requestId
  if (typeof json?.resolvedSearchType === 'string') out.resolvedSearchType = json.resolvedSearchType
  const cost = projectCost(json?.costDollars)
  if (cost !== undefined) out.costDollars = cost
  if (typeof json?.context === 'string' && json.context.length > 0) out.context = truncateText(json.context, MAX_CONTEXT_TEXT)
  const notices = projectNotices(json?.notices)
  if (notices !== undefined) out.notices = notices
  return out
}

function projectError(value) {
  if (typeof value === 'string' && value.length > 0) return { message: value }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out = {}
  if (typeof value.tag === 'string') out.tag = value.tag
  if (Number.isInteger(value.httpStatusCode)) out.httpStatusCode = value.httpStatusCode
  if (typeof value.message === 'string') out.message = value.message
  return Object.keys(out).length > 0 ? out : undefined
}

/** Project a contents response, preserving per-URL statuses. */
export function projectFetchResponse(json) {
  const out = {
    results: Array.isArray(json?.results) ? json.results.flatMap((value) => {
      if (value === null || typeof value !== 'object') return []
      const url = typeof value.url === 'string' && value.url.length > 0
        ? value.url
        : typeof value.id === 'string' && /^https?:\/\//u.test(value.id) ? value.id : undefined
      if (url === undefined) return []
      const item = { url }
      if (typeof value.id === 'string') item.id = value.id
      if (typeof value.title === 'string') item.title = value.title
      if (typeof value.author === 'string') item.author = value.author
      if (typeof value.publishedDate === 'string') item.publishedDate = value.publishedDate
      if (typeof value.text === 'string') item.text = truncateText(value.text, MAX_FETCH_TEXT)
      if (Number.isInteger(value.statusCode)) item.statusCode = value.statusCode
      const error = projectError(value.error)
      if (error !== undefined) item.error = error
      return [item]
    }) : [],
  }
  if (typeof json?.requestId === 'string' && json.requestId.length > 0) out.requestId = json.requestId
  const cost = projectCost(json?.costDollars)
  if (cost !== undefined) out.costDollars = cost
  if (typeof json?.context === 'string' && json.context.length > 0) out.context = truncateText(json.context, MAX_CONTEXT_TEXT)
  if (Array.isArray(json?.statuses)) {
    const statuses = json.statuses.flatMap((value) => {
      if (value === null || typeof value !== 'object') return []
      if (typeof value.id !== 'string' || typeof value.status !== 'string') return []
      const status = { id: value.id, status: value.status }
      if (typeof value.source === 'string') status.source = value.source
      const error = projectError(value.error)
      if (error !== undefined) status.error = error
      return [status]
    })
    if (statuses.length > 0) out.statuses = statuses
  }
  return out
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Render simple search results as citable Markdown. */
export function formatSimpleSearch(value) {
  if (!value.results || value.results.length === 0) return 'No results found.'
  const lines = value.results.map((result) => {
    const label = typeof result.title === 'string' && result.title.length > 0 ? result.title : hostnameOf(result.url)
    const safeLabel = label.split(']').join('%5D')
    const meta = []
    if (typeof result.author === 'string' && result.author.length > 0) meta.push(result.author)
    if (typeof result.publishedDate === 'string' && result.publishedDate.length > 0) meta.push(result.publishedDate)
    if (typeof result.score === 'number') meta.push('relevance ' + result.score.toFixed(3))
    const suffix = meta.length > 0 ? ' — ' + meta.join(' · ') : ''
    const snippets = Array.isArray(result.highlights)
      ? result.highlights.slice(0, 3).map((text) => '  ' + text.replace(/\s+/gu, ' ').slice(0, 600)).join('\n')
      : ''
    return '- [' + safeLabel + '](' + result.url + ')' + suffix + (snippets.length > 0 ? '\n' + snippets : '')
  })
  return 'Found ' + value.results.length + ' result(s) through Exa.\n\n' + lines.join('\n') + '\n\nCite the relevant URLs above as markdown links in your answer.'
}

/** Render advanced search results as bounded JSON. */
export function renderJson(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

const COST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    total: { type: 'number' },
    search: {
      type: 'object',
      additionalProperties: false,
      properties: {
        neural: { type: 'number' },
        keyword: { type: 'number' },
      },
    },
    summary: { type: 'number' },
    contents: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'number' },
        highlights: { type: 'number' },
        summary: { type: 'number' },
      },
    },
  },
}

const SUBPAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', required: true },
    url: { type: 'string', required: true },
    id: { type: 'string' },
    publishedDate: { type: 'string' },
    author: { type: 'string' },
  },
}

const SEARCH_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', required: true },
    url: { type: 'string', required: true },
    id: { type: 'string' },
    author: { type: 'string' },
    publishedDate: { type: 'string' },
    score: { type: 'number' },
    highlights: { type: 'array', items: { type: 'string' } },
    highlightScores: { type: 'array', items: { type: 'number' } },
    summary: { type: 'string' },
    text: { type: 'string' },
    subpages: { type: 'array', items: SUBPAGE_SCHEMA },
  },
}

const NOTICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true },
    path: { type: 'string', required: true },
    message: { type: 'string', required: true },
  },
}

const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    results: { type: 'array', required: true, items: SEARCH_RESULT_SCHEMA },
    requestId: { type: 'string' },
    resolvedSearchType: { type: 'string' },
    costDollars: COST_SCHEMA,
    context: { type: 'string' },
    notices: { type: 'array', items: NOTICE_SCHEMA },
  },
}

const ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tag: { type: 'string' },
    httpStatusCode: { type: 'integer' },
    message: { type: 'string' },
  },
}

const FETCH_PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string', required: true },
    id: { type: 'string' },
    title: { type: 'string' },
    author: { type: 'string' },
    publishedDate: { type: 'string' },
    text: { type: 'string' },
    statusCode: { type: 'integer' },
    error: ERROR_SCHEMA,
  },
}

const FETCH_STATUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    status: { type: 'string', required: true },
    source: { type: 'string' },
    error: ERROR_SCHEMA,
  },
}

const FETCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    results: { type: 'array', required: true, items: FETCH_PAGE_SCHEMA },
    requestId: { type: 'string' },
    costDollars: COST_SCHEMA,
    context: { type: 'string' },
    statuses: { type: 'array', items: FETCH_STATUS_SCHEMA },
  },
}

const ADVANCED_PARAMETERS = {
  query: { type: 'string', required: true, description: 'A complete semantic description of what to find.' },
  numResults: { type: 'integer', description: 'Number of results to return, 1-100 (default 10).' },
  type: { type: 'string', enum: ['auto', 'lite'], description: 'auto balances quality and speed; lite is lower-cost and accepts only a subset of Exa parameters. Default auto.' },
  category: { type: 'string', description: 'Optional Exa category hint, e.g. company, research paper, news, pdf, github, tweet, personal site, linkedin profile, or financial report.' },
  includeDomains: { type: 'array', items: { type: 'string' }, description: 'Only return results from these hostnames, path prefixes, or wildcard subdomains (up to 1200).' },
  excludeDomains: { type: 'array', items: { type: 'string' }, description: 'Exclude results from these hostnames, path prefixes, or wildcard subdomains (up to 1200).' },
  startPublishedDate: { type: 'string', description: 'Only results published on or after this ISO 8601 date or date-time.' },
  endPublishedDate: { type: 'string', description: 'Only results published on or before this ISO 8601 date or date-time.' },
  startCrawlDate: { type: 'string', description: 'Deprecated Exa crawl-date filter. It no longer affects results and is rejected with type lite.' },
  endCrawlDate: { type: 'string', description: 'Deprecated Exa crawl-date filter. It no longer affects results and is rejected with type lite.' },
  includeText: { type: 'array', items: { type: 'string' }, description: 'Deprecated Exa text filter. It no longer reliably affects results and is rejected with type lite.' },
  excludeText: { type: 'array', items: { type: 'string' }, description: 'Deprecated Exa text filter. It no longer reliably affects results and is rejected with type lite.' },
  userLocation: { type: 'string', description: 'Two-letter ISO 3166-1 country code that localizes results.' },
  moderation: { type: 'boolean', description: 'Filter unsafe content from results.' },
  additionalQueries: { type: 'array', items: { type: 'string' }, description: 'Additional query variations. Exa currently applies these only to deep search types; rejected with type lite.' },
  textMaxCharacters: { type: 'integer', description: 'Return page text capped at this many characters per result, 1-50000. Omit it to avoid full text and its cost.' },
  contextMaxCharacters: { type: 'integer', description: 'Deprecated Exa combined-context option, capped at 100000 characters. Rejected with type lite.' },
  enableSummary: { type: 'boolean', description: 'Ask Exa to summarize each result (default false).' },
  summaryQuery: { type: 'string', description: 'Guidance for result summaries. Requires enableSummary: true.' },
  enableHighlights: { type: 'boolean', description: 'Return relevance-guided highlight snippets (default true). Set false to omit them.' },
  highlightsMaxCharacters: { type: 'integer', description: 'Cap highlight text per result at 1-8000 characters.' },
  highlightsQuery: { type: 'string', description: 'Guide which passages become highlights.' },
  maxAgeHours: { type: 'integer', description: 'Maximum cached-content age in hours: -1 cache-only, 0 always fresh, 1-720. Rejected with type lite.' },
  livecrawlTimeout: { type: 'integer', description: 'Live-crawl timeout in milliseconds, 1-90000. Rejected with type lite.' },
  subpages: { type: 'integer', description: 'Crawl up to this many subpages per result, 0-100. Rejected with type lite.' },
  subpageTarget: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'String or array naming the subpages to find. Requires subpages greater than 0 and is rejected with type lite.' },
}

function log(ctx, level, message, ...args) {
  const logger = ctx !== undefined && ctx !== null ? ctx.logger : undefined
  const method = logger !== undefined && logger !== null && typeof logger[level] === 'function' ? logger[level] : undefined
  if (method === undefined) return
  try {
    method.call(logger, message, ...args)
  } catch {
    /* Logging must never affect tool registration. */
  }
}

/**
 * Register the three tools and one short system-prompt section. The returned
 * disposer unregisters all of them and is idempotent.
 *
 * The missing-key startup warning belongs to the Host management entry, so a
 * preset that mounts these tools never prints it a second time. A call without
 * a usable key still fails with the not_configured error from exa-client.js.
 */
export function installTools(ctx) {
  const disposers = []
  const rotation = { cursor: 0 }
  const register = (definition) => {
    disposers.push(ctx.tools.register(definition))
  }

  register(defineTool({
    name: 'exa_search',
    description: 'Search the web through Exa using a semantic query. Returns ranked results with titles, URLs, IDs, authors, publication dates, highlights, and relevance scores.',
    parameters: {
      query: { type: 'string', required: true, description: 'A complete semantic description of what to find; prefer a natural-language intent over keywords.' },
      numResults: { type: 'integer', description: 'Number of results to return, 1-20 (default 10).' },
    },
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatSimpleSearch(value) }],
    },
    timeoutMs: 30000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = normalizeSimpleArgs(args)
      const { json } = await performWithFailover(ctx, rotation, {
        operation: 'search',
        path: '/search',
        body: buildSimpleBody(input),
        timeoutMs: 30000,
        exec,
      })
      logWarnings(ctx, 'search', json)
      return projectSearchResponse(json)
    },
  }))

  register(defineTool({
    name: 'exa_search_advanced',
    description: 'Search the web through Exa with filters and content options. Returns ranked results plus any requested highlights, text, summaries, or subpages. Use exa_search for a simple semantic query.',
    parameters: ADVANCED_PARAMETERS,
    output: { schema: SEARCH_OUTPUT_SCHEMA, render: renderJson },
    timeoutMs: 60000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = normalizeAdvancedArgs(args)
      const { json } = await performWithFailover(ctx, rotation, {
        operation: 'search_advanced',
        path: '/search',
        body: buildAdvancedBody(input),
        timeoutMs: 60000,
        exec,
      })
      logWarnings(ctx, 'search_advanced', json)
      return projectSearchResponse(json)
    },
  }))

  register(defineTool({
    name: 'exa_fetch',
    description: 'Read the contents of known HTTP(S) URLs through Exa. Returns page metadata and extracted text, with per-URL status information when Exa provides it.',
    parameters: {
      urls: { type: 'array', required: true, items: { type: 'string' }, description: '1-20 absolute HTTP(S) URLs.' },
      maxCharacters: { type: 'integer', description: 'Maximum extracted text per page, 1-50000 (default 3000). Larger values cost more.' },
    },
    output: { schema: FETCH_OUTPUT_SCHEMA, render: renderJson },
    timeoutMs: 60000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = normalizeFetchArgs(args)
      const { json } = await performWithFailover(ctx, rotation, {
        operation: 'fetch',
        path: '/contents',
        body: buildFetchBody(input),
        timeoutMs: 60000,
        exec,
      })
      return projectFetchResponse(json)
    },
  }))

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined && systemPrompt !== null) {
    disposers.push(systemPrompt.section({
      name: 'tool:exa',
      order: 111,
      text: 'Exa tools are available for semantic web search (exa_search, exa_search_advanced) and reading known URLs (exa_fetch). They are additional to the built-in web_search and web_fetch. Cite returned URLs as markdown links in your answer.',
    }))
  }

  return function disposeExaTools() {
    while (disposers.length > 0) {
      const dispose = disposers.pop()
      try {
        dispose()
      } catch (error) {
        log(ctx, 'warn', 'dsh-exa: tool teardown failed: %s', error instanceof Error ? error.message : String(error))
      }
    }
  }
}
