# dsh-exa

Exa tools and a Plugins-page management card for DeepSeek Harness. The package adds three model tools — `exa_search`, `exa_search_advanced`, and `exa_fetch` — backed by an ordered multi-key client with per-key active flags and priority or round-robin routing. It also adds a card on the **Plugins** page for key management, active-state toggles, routing strategy, drag or button ordering, and a button that opens the Exa Billing dashboard. Only active keys enter routing; an HTTP 402 response deactivates the key that produced it, and a call made while every key is inactive returns HTTP 402 (payment required) without an Exa request.

The built-in `web_search` and `web_fetch` tools are not replaced. This package never registers a web search provider and never changes `ctx.web`.

- Package name: `dsh-exa`
- Bundle patch row: `dsh-exa`
- Target runtime: DeepSeek Harness 0.2.1-x (every 0.2.1 prerelease and the 0.2.1 release), Node.js 22 or newer
- Current release: 0.3.1

## Install

Build the browser bundle before installing from a checkout:

```bash
node scripts/build-client.mjs
```

Install the directory through **Plugins → Add plugin** in the Web UI, or with the equivalent CLI install against the current profile. The bundle is selected and its `dsh-exa` row is enabled by `plugin_manager install_bundle`. After a source change to the Host half, restart the Harness; client-only changes can reload with the profile's HMR receiver while the Web dev watcher is active.

The package has no install scripts. Its peer dependencies are the DSH packages already present in the Harness installation: `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, and `@deepseek-ai/dsh-home-paths`. The two DSH peers use the `>=0.2.1-0 <0.2.2-0` range described under Compatibility.

## Compatibility

The package supports the entire DeepSeek Harness `0.2.1` line: every `0.2.1-*` prerelease and the eventual `0.2.1` release. Earlier and later lines are outside the declared range. The manifest states this in four places.

| Field | Value | Role |
| --- | --- | --- |
| `engines.dsh` | `>=0.2.1-0 <0.2.2-0` | The admission check DSH runs on install, update, and startup. When present, it decides alone and the DSH peer ranges are ignored. |
| `peerDependencies` | the same range for `@deepseek-ai/dsh-home-paths` and `@deepseek-ai/dsh-tools` | Module contract used by the package-manager toolchain and by hosts that predate `engines.dsh`. |
| `dsh.compatibility.dsh` | the same range | Descriptive store metadata; the Host does not read it. |
| `dsh.compatibility.dshReleases` | `0.2.1-rc.3`, `0.2.1-rc.5` | Per-release evidence for the releases actually exercised; the Host does not read it. |

The range admits prereleases because the lower bound carries the `-0` comparator, and it stops before the next patch line because the upper bound is `<0.2.2-0`. It accepts `0.2.1-alpha.1` through `0.2.1-rc.5`, any later `0.2.1-*` prerelease, and `0.2.1`; it rejects `0.2.0-rc.2`, `0.2.2-alpha.1`, and `0.3.0`. The host evaluates ranges with `includePrerelease: true` and npm evaluates them by default; this range produces the same decisions under both.

## Configuration

| Variable | Role |
| --- | --- |
| `EXA_API_KEYS` | Ordered, comma-separated key list. When non-empty this is the authoritative source. |
| `EXA_API_KEY` | Single-key fallback. When the list is empty, this key is used. The card keeps it in step with the first list item when the variable is writable. |

The environment that launches `dsh` owns its variables read-only. A read-only key cannot be changed from the card; the card says so and disables value, order, replacement, and deletion controls. Its active state is local manager metadata, so it can still be toggled from the card. Editable keys live in the provider-managed credential store and can be managed from the card or in `~/.dsh/.credentials.yaml`.

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
- Every call snapshots the active key order before its first request. Inactive keys keep their list positions but do not enter that order.
- Only HTTP 401, 402, and 429 trigger failover. 400, 403, 422, 5xx, timeouts, caller cancellation, and network errors are returned without trying another key.
- HTTP 402 marks the responding key inactive immediately and records the reason and time in manager state. The key stays out of routing until the user re-enables it. A 401 or 429 does not change active state.
- Each distinct active key is tried at most once per call. When every active key fails but at least one key remains active, the error retains the last response's `requestId`, `tag`, and message, and notes that a team-level credit or budget problem may affect every key in the same team.
- When no key is active, or the last active key returns 402 during the call, the tool fails with an `ExaApiError` carrying status 402 and code `payment_required`. No further Exa request is made after the active set becomes empty.
- `costDollars` is passed through as an estimate only; it is not treated as a billing record.
- Exa response warnings are logged Host-side rather than shown to the model. Model-facing notices are returned in the `notices` array.

## Routing strategies

| Strategy | Start of each call | Failover |
| --- | --- | --- |
| `priority` (default) | First active key in the list | Continue down the list through active keys |
| `round-robin` | Next active key at or after the in-memory shared cursor | Continue from the selected start through active keys, wrapping once |

Only active keys participate. An inactive key keeps its list position, so toggling active state does not renumber the other keys. In `round-robin` the cursor is an index into the full list and advances once per tool call; if it points at an inactive key, the next active key at or after that position starts the call. The cursor resets when the process restarts. The key order itself is persisted only in the credential list. The card never sends continuous writes while dragging; it edits a local draft and sends one `reorder` request when **Save order** is pressed. Up and down buttons produce the same draft changes for keyboard and no-drag environments.

The card does not reorder keys from `costDollars`. Only an explicit user action changes the order.

## Key states

Each configured key has a local active flag stored in `~/.dsh/exa-manager.json` under its non-secret fingerprint. A key with no stored flag is active by default. The card renders the flag as a clickable **Active** or **Inactive** tag in the key row, and shows why and when an inactive key was deactivated. Toggling the flag is a user-only management action; it changes manager state rather than credentials, so it works for keys supplied read-only by the launching environment.

An HTTP 402 response sets the flag with reason `http_402`. Replacing or removing a key clears its stored flag, and adding a key starts it active. The plugin does not re-enable keys automatically after a top-up; the user re-enables them from the card. When every configured key is inactive, the card shows a warning and the three tools return the 402 payment-required error described above until a key is re-enabled or a new key is added.

## Billing

The card includes an **Open Exa Billing** button that opens <https://dashboard.exa.ai/billing> in a new tab. Exa keeps credit balance, invoices, and auto recharge in that dashboard. A key that returns HTTP 402 is marked inactive by the plugin; after topping up, re-enable it in the key list.

The plugin does not query or display the team credit balance. Exa's public API has no balance or credit endpoint; the Team Management API that exposes per-key usage and budgets does not return the remaining team balance. The card therefore avoids presenting an approximate number as an account balance.

Each Exa response still carries `costDollars` for the individual request. The tools pass that field through as an estimate, not as a billing record. Historical usage and per-key budgets remain available in the Exa dashboard.

## Security and state

- Full normal keys are returned only by an explicit reveal request. Every management response uses `Cache-Control: no-store`.
- Neither key values nor Authorization headers are written to logs. Ordering requests use local fingerprints; add and replace necessarily send the supplied key value to the local Host route over the same-origin channel.
- The manager state is `~/.dsh/exa-manager.json`, written atomically with mode `0600` where the platform supports it. It contains the routing strategy, per-key active flags with reasons and timestamps, and display timestamps; it contains no secrets.
- `EXA_API_KEYS` is authoritative. The card does not merge `EXA_API_KEY` back into the list, which would resurrect a removed key. A delete that would fall back to an inherited read-only primary is refused with an explanation.
- The management route is served by the local DSH web server. This package does not add CORS headers or a second server.
- Key management, reveal, replacement, deletion, ordering, and active-state toggles are user-only card operations. They are not exposed as Agent tools.

## Package layout

| Path | Role |
| --- | --- |
| `src/index.js` | Host entry, service injection, owning-fiber lifecycle |
| `src/tools.js` | Three tool definitions, validation, request mapping, projections, render |
| `src/exa-client.js` | Exa HTTP transport, active-key failover, 402 deactivation |
| `src/key-manager.js` | Credential reads/writes, key metadata and active state, primary synchronization |
| `src/backend.js` | `/api/exa-manager`, including key active-state changes |
| `src/lib.js` | Pure parsing, masking, active-key ordering, URL/date validation |
| `src/state.js` | Non-secret manager state, including active flags |
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

Functional verification was performed on 2026-10-29 against DSH `0.2.1-rc.3` in the Web profile. The compatibility change was verified on 2026-10-31 against DSH `0.2.1-rc.5`.

- The 0.3.0 bundle was removed and reinstalled from `/home/andyk/.dsh-local-plugins/dsh-exa`; `remove_bundle` and `install_bundle` both reported `application: applied` and `changed: true`, package version `0.3.0`, with no warnings.
- The Host tool catalog contains exactly three new native tools: `exa_search`, `exa_search_advanced`, and `exa_fetch`. Existing `web_search` and `web_fetch` remain present; this package registers no web provider and does not touch `ctx.web`.
- The client slot `plugins.bundle.config` has an active `dsh-exa` occupant.
- `GET /api/exa-manager` returned HTTP 200 with `content-type: application/json` and `cache-control: no-store`. The payload reported two configured keys, both active, priority routing, `activeCount: 2`, `inactiveCount: 0`, and `allInactive: false`, with masked key values only.
- `POST /api/exa-manager` with `action: setKeyActive` and an unknown id returned HTTP 404 `key_not_found`; a follow-up GET still reported both keys active, confirming that the new action is live and that the probe did not change state.
- A PTC dispatch of `exa_search` with an empty query reached the registered tool and returned `ToolCallError: query must be a non-empty string`, confirming that the installed tool is callable through the PTC surface.
- `node --test` passes 69 test cases across pure helpers, request mapping, failover, active-key filtering, round-robin cursor behavior, 402 auto-deactivation, all-inactive payment errors, read-only credentials, state permissions, manager actions including `setKeyActive`, client bundle construction and freshness, the manifest compatibility range, the request user agent, and Host mount/unmount lifecycle.
- On 2026-10-31 the 0.3.1 manifest was evaluated with the `0.2.1-rc.5` app-boot compatibility check and reported no unmet requirements. All ten published `0.2.1` versions (`0.2.1-alpha.1` through `0.2.1-rc.5`), a later `0.2.1-rc.6`, and `0.2.1` satisfy the declared range under both the Host's `includePrerelease: true` evaluation and npm's default semantics; `0.2.0-rc.2`, `0.2.2-0`, `0.2.2-alpha.1`, and `0.3.0` do not. The package was then synchronized into `/home/andyk/.dsh-local-plugins/dsh-exa`, the link target of the profile's `dsh-exa` dependency; the installed manifest was evaluated again with the same rc.5 check and was admitted.

Not verified live:

- Successful calls to the real Exa Search/Contents API were not executed because they consume the configured key's credits and no explicit cost approval was given. Success paths are covered by mock-fetch tests, including schema validation of the canonical outputs.
- A live HTTP 402 auto-deactivation and the all-inactive lockout were not triggered against the profile because that would consume credits or change the user's key state. Both paths are covered by mock-fetch tests, including the persisted inactive reason and the no-request 402 on the following call.
- Visual browser verification (light/dark, narrow width, the active-state switch, drag interaction, the Billing button's new tab, console) was not available in this environment. The updated client bundle is on disk and the slot registration is active, but the page was not refreshed or visually inspected in this session. The built bundle was executed with a stub React runtime in tests.
- A full Harness process restart was not performed, so the 0.3.1 Host code has not been loaded by the running rc.5 process; the Host mount and route checks above were recorded on rc.3 with 0.3.0. Host mount/unmount and route/tool/prompt disposers are covered by tests, and the 0.3.1 changes relative to 0.3.0 are the manifest, the documentation, and the manifest test.
- No 0.2.1 release other than rc.3 and rc.5 was installed or started. The range decisions for the other releases were evaluated with semver, not by running the Harness on each release.

See [docs/verification.md](./docs/verification.md) for the recorded checks and limits.

## Non-goals

This release intentionally does not include Exa Agent, Research, or `agent_run`; Tavily-style `map` and `crawl` tools; a team credit-balance query; per-key usage history inside the card; automatic key reordering from usage history; a replacement for the built-in web tools; automatic re-enabling of keys after a top-up; automatic disabling of an existing MCP Exa server; or Agent-facing key-management tools.

## References

- Exa Search: <https://docs.exa.ai/reference/search>
- Exa Contents: <https://docs.exa.ai/reference/contents-api-guide-for-coding-agents>
- Exa Billing: <https://exa.ai/docs/admin/billing>
- Exa Billing dashboard: <https://dashboard.exa.ai/billing>
