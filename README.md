# dsh-exa

Exa tools and a Plugins-page management card for DeepSeek Harness. The package adds three model tools — `exa_search`, `exa_search_advanced`, and `exa_fetch` — backed by an ordered multi-key client with priority or round-robin routing. It also adds a card on the **Plugins** page for key management, routing strategy, optional Team Management budgets and usage, and drag or button ordering.

The built-in `web_search` and `web_fetch` tools are not replaced. This package never registers a web search provider and never changes `ctx.web`.

- Package name: `dsh-exa`
- Bundle patch row: `dsh-exa`
- Target runtime: DeepSeek Harness 0.2.1-rc.3, Node.js 22 or newer
- First release: 0.1.0

## Install

Build the browser bundle before installing from a checkout:

```bash
node scripts/build-client.mjs
```

Install the directory through **Plugins → Add plugin** in the Web UI, or with the equivalent CLI install against the current profile. The bundle is selected and its `dsh-exa` row is enabled by `plugin_manager install_bundle`. After a source change to the Host half, restart the Harness; client-only changes can reload with the profile's HMR receiver while the Web dev watcher is active.

The package has no install scripts. Its peer dependencies are the DSH packages already present in the Harness installation: `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, and `@deepseek-ai/dsh-home-paths`.

## Configuration

| Variable | Role |
| --- | --- |
| `EXA_API_KEYS` | Ordered, comma-separated key list. When non-empty this is the authoritative source. |
| `EXA_API_KEY` | Single-key fallback. When the list is empty, this key is used. The card keeps it in step with the first list item when the variable is writable. |
| `EXA_SERVICE_API_KEY` | Optional Team Management service account key. It is used only for Admin API reads, never for search or contents calls. |

The environment that launches `dsh` owns its variables read-only. A read-only key cannot be changed from the card; the card says so and disables the relevant controls. Editable keys live in the provider-managed credential store and can be managed from the card or in `~/.dsh/.credentials.yaml`.

The card is registered in the `plugins.bundle.config` slot under the key `dsh-exa`, so it appears on the **Plugins → dsh-exa** bundle page between the description and the row list. It is not a sidebar entry, a chat card, or a standalone page.

## Tools

### `exa_search`

A fixed simple search: Exa `type: "auto"`, default highlights, and a result count from 1 to 20. The result render is Markdown with citable URLs and up to three highlights per source.

| Parameter | Rules |
| --- | --- |
| `query` | Required non-empty semantic description. |
| `numResults` | Integer 1–20, default 10. |

### `exa_search_advanced`

Maps the flat model parameters onto Exa's nested request body. Highlights are on by default; full text, summaries, and the deprecated context option are requested only when the caller sets their parameters. The tool timeout is 60 seconds.

| Group | Parameters |
| --- | --- |
| Basic | `query`, `numResults` (1–100, default 10), `type` (`auto` or `lite`) |
| Filters | `category`, `includeDomains`, `excludeDomains`, `startPublishedDate`, `endPublishedDate`, `userLocation`, `moderation` |
| Compatibility fields | `startCrawlDate`, `endCrawlDate`, `includeText`, `excludeText`, `additionalQueries` |
| Content | `textMaxCharacters`, `contextMaxCharacters`, `maxAgeHours`, `livecrawlTimeout`, `subpages`, `subpageTarget` |
| Summaries and highlights | `enableSummary`, `summaryQuery`, `enableHighlights`, `highlightsMaxCharacters`, `highlightsQuery` |

Validation happens before any HTTP request:

- Dates must be ISO 8601 and each start must not be after its end.
- `summaryQuery` requires `enableSummary: true`; highlight options require highlights to be enabled.
- `subpageTarget` requires a positive `subpages` value.
- `lite` rejects parameters Exa does not accept for that mode, including crawl dates, text filters, additional queries, summaries, context, cache controls, and subpages.
- The official category limits are enforced for `company` and `people` where published dates or domain exclusions are unsupported.

Current Exa documentation marks `startCrawlDate`, `endCrawlDate`, `includeText`, `excludeText`, search-level `subpages`, and `context` as deprecated. They remain available on this tool for compatibility with the implementation plan, but Exa may ignore them or return a warning. `additionalQueries` is currently applied only to deep search types; this release exposes only `auto` and `lite`, so do not rely on it for result expansion.

### `exa_fetch`

Reads one or more known HTTP(S) URLs through `/contents`, requesting text only.

| Parameter | Rules |
| --- | --- |
| `urls` | Required array of 1–20 absolute HTTP(S) URLs. Duplicates are collapsed. |
| `maxCharacters` | Integer 1–50000, default 3000. |

The canonical output keeps each page's URL, ID, title, author, publication date, text, status code when present, and any per-page error. The response's `statuses` array is preserved separately so a failed URL is not silently dropped. Output text is capped at 50,000 characters per page.

### Shared behavior

- Keys are re-read from the credential service on every operation; no credential is cached across calls.
- Every call snapshots the key order before its first request.
- Only HTTP 401, 402, and 429 trigger failover. 400, 403, 422, 5xx, timeouts, caller cancellation, and network errors are returned without trying another key.
- Each distinct key is tried at most once per call. When every key fails, the error retains the last response's `requestId`, `tag`, and message, and notes that a team-level credit or budget problem may affect every key in the same team.
- `costDollars` is passed through as an estimate only; it is not treated as a billing record.
- Exa response warnings are logged Host-side rather than shown to the model. Model-facing notices are returned in the `notices` array.

## Routing strategies

| Strategy | Start of each call | Failover |
| --- | --- | --- |
| `priority` (default) | First key in the list | Continue down the list |
| `round-robin` | Next key by an in-memory shared cursor | Continue from the selected start, wrapping once |

The round-robin cursor advances once per tool call and resets when the process restarts. The key order itself is persisted only in the credential list. The card never sends continuous writes while dragging; it edits a local draft and sends one `reorder` request when **Save order** is pressed. Up and down buttons produce the same draft changes for keyboard and no-drag environments.

The card does not reorder keys from usage history or from `costDollars`. Only an explicit user action changes the order.

## Team Management

Team Management is enabled per Exa team. Create a service account key from the **Service keys** tab of the Exa API keys page, then paste it into the service-key section of the card. If the feature is not enabled for the team, or the key lacks permission, the usage area shows the failure and key management/ordering continue to work.

The usage route performs only `GET` Admin API calls:

- `GET /api-keys` for team key names, rate limits, budget cents, and `isOverBudget`.
- `GET /api-keys/{id}/usage` for the selected date range.

Budget applies to the team's current billing period. Cost applies to the selected date range. The card shows them side by side and does not derive remaining budget or team credit balance. The default range is the last 30 days; a start date older than 180 days is rejected, as are reversed and malformed ranges.

The card links each local key to a team key by stable local fingerprint. The Admin API does not return normal key material, so linking is normally a one-time manual selection from the team key list. The association is stored as non-secret metadata. Each row can fail independently: a missing service key, an unauthorized service key, an unlinked local key, a removed team key, or one failed usage call does not block the other rows or key management.

Usage responses are cached for about 60 seconds and identical in-flight queries are merged. `refresh=1` bypasses the cache. The cache is owned by the plugin installation and cleared on unload.

## Security and state

- Full normal keys and the service key are returned only by an explicit reveal request. Every management response uses `Cache-Control: no-store`.
- Neither key values nor Authorization headers are written to logs. Ordering and association requests use local fingerprints; add and replace necessarily send the supplied key value to the local Host route over the same-origin channel.
- The manager state is `~/.dsh/exa-manager.json`, written atomically with mode `0600` where the platform supports it. It contains the routing strategy, display timestamps, and local-key-to-Admin-key associations; it contains no secrets.
- `EXA_API_KEYS` is authoritative. The card does not merge `EXA_API_KEY` back into the list, which would resurrect a removed key. A delete that would fall back to an inherited read-only primary is refused with an explanation.
- The routes are served by the local DSH web server. This package does not add CORS headers or a second server.
- Key management, reveal, replacement, deletion, and ordering are user-only card operations. They are not exposed as Agent tools.

## Package layout

| Path | Role |
| --- | --- |
| `src/index.js` | Host entry, service injection, owning-fiber lifecycle |
| `src/tools.js` | Three tool definitions, validation, request mapping, projections, render |
| `src/exa-client.js` | Exa HTTP transport, error classification, failover |
| `src/key-manager.js` | Credential reads/writes, key metadata, primary synchronization |
| `src/usage.js` | Team Management reads, cache, and in-flight merging |
| `src/backend.js` | `/api/exa-manager` and `/api/exa-usage` |
| `src/lib.js` | Pure parsing, masking, ordering, URL/date validation |
| `src/state.js` | Non-secret manager state |
| `src/client.js` | Card source, serialized by the build script |
| `lib/client.js` | Built browser bundle, required by the `./client` export |
| `locale/en.json`, `locale/zh.json` | Plugin metadata and the card dictionaries used by the build |
| `scripts/build-client.mjs` | Inject the dictionaries and emit the module-loader bundle |

## Development

```bash
node scripts/build-client.mjs   # build lib/client.js
node --test                    # unit and lifecycle tests
node --check src/client.js      # syntax check the factory source
```

For local development, either run the package manager to install the declared DSH dev dependencies, or link the three DSH packages into `node_modules/@deepseek-ai` from the installation's `node_modules`. The tests use an in-memory credential service, a temporary `DSH_HOME`, and a mock `fetch`; they do not call Exa or consume credits.

The client build replaces the `__UI_DICTS__` placeholder inside `factory` with the `card` dictionaries from the two locale files, checks that their key sets match, wraps the factory in `window.__ModuleLoader__.load`, and runs `node --check` on the output. Editing `lib/client.js` directly is overwritten by the next build.

## Verification

Verification was performed on 2026-10-29 against DSH `0.2.1-rc.3` in the Web profile.

- The bundle installed with `application: applied`, package version `0.1.0`.
- The Host tool catalog contains exactly three new native tools: `exa_search`, `exa_search_advanced`, and `exa_fetch`. Existing `web_search` and `web_fetch` remain present; this package registers no web provider and does not touch `ctx.web`.
- The client slot `plugins.bundle.config` has an active `dsh-exa` occupant.
- Live route probes returned HTTP 200 with `content-type: application/json` and `cache-control: no-store`. The manager route reported one key from `EXA_API_KEY`, priority routing, and no service key. The usage route returned `configured: false` with an explanatory message, as designed.
- A PTC dispatch of `exa_search` with an empty query reached the registered tool and returned the validation error `query must be a non-empty string`, confirming that the installed tool is callable through the PTC surface.
- `node --test` passes 66 test cases across pure helpers, request mapping, failover, round-robin cursor behavior, read-only credentials, state permissions, manager actions, usage mapping, caching, client bundle construction and freshness, and Host mount/unmount lifecycle.

Not verified live:

- Successful calls to the real Exa Search/Contents API were not executed because they consume the configured key's credits and no explicit cost approval was given. Success paths are covered by mock-fetch tests, including schema validation of the canonical outputs.
- Team Management was not called against the real Admin API because no service key is configured in this profile. The adapter, range validation, mapping, cache, and failure paths are covered by mocks.
- Visual browser verification (light/dark, narrow width, drag interaction, console) was not available in this environment. Slot registration is active; the built bundle was executed with a stub React runtime in tests.
- Live unload/reload was not repeated after the installation because the session's approval policy changed to reject plugin-manager actions. Host mount/unmount and route/tool/prompt disposers are covered by tests.

See [docs/verification.md](./docs/verification.md) for the recorded checks and limits.

## Non-goals

This first release intentionally does not include Exa Agent, Research, or `agent_run`; Tavily-style `map` and `crawl` tools; team credit balance; automatic key reordering from usage history; a replacement for the built-in web tools; automatic disabling of an existing MCP Exa server; or Agent-facing key-management tools.

## References

- Exa Search: <https://docs.exa.ai/reference/search>
- Exa Contents: <https://docs.exa.ai/reference/contents-api-guide-for-coding-agents>
- Team Management OpenAPI: <https://exa.ai/docs/team-management-spec.yaml>
- Get API key usage: <https://exa.ai/docs/reference/team-management/get-api-key-usage.md>
- List API keys: <https://exa.ai/docs/reference/team-management/list-api-keys.md>
