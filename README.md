# dsh-exa

Exa tools and a Plugins-page management card for DeepSeek Harness, delivered as one package with two entries. The Host entry registers the Plugins-page card, its exact `/api/exa-manager` route, and one startup check for a missing Exa key. The preset entry `dsh-exa/tools` registers the three model tools — `exa_search`, `exa_search_advanced`, and `exa_fetch` — plus a short `tool:exa` system-prompt section, backed by an ordered multi-key client with per-key active flags and priority or round-robin routing.

The card manages the key list, per-key active state, the routing strategy, drag or button ordering, and a button that opens the Exa Billing dashboard. Only active keys enter routing; an HTTP 402 response deactivates the key that produced it, and a call made while every key is inactive returns HTTP 402 (payment required) without an Exa request.

The built-in `web_search` and `web_fetch` tools are not replaced. This package never registers a web search provider and never changes `ctx.web`.

- Package name: `dsh-exa`
- Host entry: `dsh-exa` (bundle patch row `dsh-exa`)
- Preset entry: `dsh-exa/tools`
- Target runtime: DeepSeek Harness 0.2.1-x and 0.2.2-x (every prerelease and the stable release of both lines), Node.js 22 or newer; DSH 0.2.2 itself requires Node.js 24.9 or newer
- Current release: 0.4.1

## Two entries

| Entry | Mounted by | Owns |
| --- | --- | --- |
| `dsh-exa` | The bundle patch, once in the Host composition | The `plugins.bundle.config` card carrier, the exact `/api/exa-manager` route, and the per-mount missing-key warning |
| `dsh-exa/tools` | Agent presets, once per preset scope | `exa_search`, `exa_search_advanced`, `exa_fetch`, the `tool:exa` prompt section, and that scope's round-robin cursor |

One package, one install, one credential store, one manager state file. The split exists so that the model-facing tools follow the preset a session selects rather than every preset the profile inherits. The Host entry keeps the management route in exactly one place, so several presets can mount the tools entry without registering the same route twice.

`cordis.patch.yml` inserts only the Host row:

```yaml
- insert:
    - id: dsh-exa
      name: dsh-exa
```

The bundle does not add rows to any preset. DSH 0.2.1-rc.5 bundle patches can append rows to a `group: true` entry whose config is an array; an agent preset keeps its child plugins in `config.plugins`, which the bundle patch format cannot target. Enabling the tools in a preset is an explicit profile edit, described next.

## Install

Build the browser bundle before installing from a checkout:

```bash
node scripts/build-client.mjs
```

Install the directory through **Plugins → Add plugin** in the Web UI, or with the equivalent CLI install against the current profile. The bundle is selected and its `dsh-exa` Host row is enabled by `plugin_manager install_bundle`. The package has no install scripts, and its two DSH peers use the two-line range described under Compatibility.

The install adds the Host half only. Add the tools entry to each preset that should give its agents the Exa tools. In a preset declaration, place the row next to the existing `tool-web` row so the tool catalog order stays predictable:

```yaml
          - id: tool-web
            name: '@deepseek-ai/dsh-tool-web'
            config:
              search: true
              fetch: true
              searchTimeoutMs: 60000
          - id: exa-tools
            name: dsh-exa/tools
```

The row id `exa-tools` is local to its preset; the same id may appear in several presets. Do not add a `config` block: the tools entry has no configuration and needs none.

After a change to the Host half, restart the Harness. A change to the tools entry is a preset change; treat it as requiring a restart too, because preset revisions are activated eagerly and are not promised to hot-reload. Client-only changes can reload with the profile's HMR receiver while the Web dev watcher is active.

## Preset visibility

The tools entry is mounted per preset, so visibility is a per-preset decision:

| Preset | Exa tools | Presentation |
| --- | --- | --- |
| `standard-instant` | Yes | Native tools |
| `ptc-instant` | Yes | `run_code` TypeScript SDK bindings |
| `cordis-ptc` | Yes | `run_code` TypeScript SDK bindings |
| `minimal` | No | Not applicable |
| `chat-assistant` | No | Not applicable |
| `standard`, `ptc`, `cordis` | No | Not applicable |

A subagent that omits `preset` inherits its parent's composition, so it gets Exa exactly when the parent preset does. A subagent that names another preset follows that preset's row.

## Upgrade from 0.3.1

0.3.1 registered the tools globally from the Host row, so every preset inherited them. 0.4.0 moves the tools to `dsh-exa/tools`; upgrading the package without adding the preset rows leaves every preset without Exa tools. This is a deliberate behavior change.

The migration changes the package and three preset declarations together, while the Harness is stopped:

1. Stop the Harness.
2. Install or synchronize 0.4.0 into the existing install location.
3. Add the `exa-tools` row to `standard-instant`, `ptc-instant`, and `cordis-ptc`, next to each preset's `tool-web` row.
4. Check that no preset mounts the package root `dsh-exa` as a tool row; presets use `dsh-exa/tools` only.
5. Start the Harness.
6. Confirm the three target presets report no broken activation, the Host registers one `/api/exa-manager` route, and a new session in each target preset shows the three tools or their PTC bindings.

Existing sessions resume against the current same-id preset definition after the restart. A session in a preset without the row keeps its historical tool-call messages but receives no Exa tools in new requests.

## Uninstall and rollback

Delete every `dsh-exa/tools` row before removing the package. A preset that still references the subpath after the package is gone fails to resolve and stays broken on the roster. The order is:

1. Stop the Harness.
2. Remove the `exa-tools` row from every preset that has one.
3. Remove the bundle with the Plugins page or the equivalent `remove_bundle` action.
4. Start the Harness.
5. Confirm no `exa-tools` reference remains.

Rolling back to 0.3.1 is the same operation in reverse, and it must move both halves at once: stop the Harness, delete the `exa-tools` rows, restore the 0.3.1 package, and start. 0.3.1 has no `dsh-exa/tools` export, so leaving a row behind makes those presets broken. Keeping 0.4.0 while deleting the rows leaves every preset without Exa tools. Neither partial state is a valid resting point. `~/.dsh/exa-manager.json` keeps its schema in both directions, so no data migration is needed.

## Compatibility

The package supports the entire DeepSeek Harness `0.2.1` and `0.2.2` lines: every prerelease and the stable release of both lines. Earlier and later lines are outside the declared range. The manifest states this in four places.

| Field | Value | Role |
| --- | --- | --- |
| `engines.dsh` | `>=0.2.1-0 <0.2.2-0 \|\| >=0.2.2-0 <0.2.3-0` | The admission check DSH runs on install, update, and startup. When present, it decides alone and the DSH peer ranges are ignored. |
| `peerDependencies` | the same range for `@deepseek-ai/dsh-home-paths` and `@deepseek-ai/dsh-tools` | Module contract used by the package-manager toolchain and by hosts that predate `engines.dsh`. |
| `dsh.compatibility.dsh` | the same range | Descriptive store metadata; the Host does not read it. |
| `dsh.compatibility.dshReleases` | `0.2.1-rc.3`, `0.2.1-rc.5` | Per-release evidence for the releases actually exercised. The 0.2.2 line is covered by the declared range but has no exercised release entry yet. The Host does not read it. |

The range admits prereleases in both lines because each lower bound carries the `-0` comparator, and it stops before the next patch line with `<0.2.2-0` and `<0.2.3-0`. It accepts every `0.2.1-*` prerelease and `0.2.1`, every `0.2.2-*` prerelease and `0.2.2`; it rejects `0.2.0-rc.2`, `0.2.3-alpha.1`, and `0.3.0`. The host evaluates ranges with `includePrerelease: true` and npm evaluates them by default; this range produces the same decisions under both.

The 0.4.1 compatibility expansion does not change the entry split or the runtime dependencies; the two DSH peer ranges change with `engines.dsh`.

## Configuration

| Variable | Role |
| --- | --- |
| `EXA_API_KEYS` | Ordered, comma-separated key list. When non-empty this is the authoritative source. |
| `EXA_API_KEY` | Single-key fallback. When the list is empty, this key is used. The card keeps it in step with the first list item when the variable is writable. |

The environment that launches `dsh` owns its variables read-only. A read-only key cannot be changed from the card; the card says so and disables value, order, replacement, and deletion controls. Its active state is local manager metadata, so it can still be toggled from the card. Editable keys live in the provider-managed credential store and can be managed from the card or in `~/.dsh/.credentials.yaml`.

The card is registered in the `plugins.bundle.config` slot under the key `dsh-exa`, so it appears on the **Plugins → dsh-exa** bundle page between the description and the row list. It is not a sidebar entry, a chat card, or a standalone page.

The card governs the key list and the routing strategy for the whole profile. It does not decide which agents receive the Exa tools: that follows from the `dsh-exa/tools` row of each preset. Disabling the Host `dsh-exa` row removes the card and the `/api/exa-manager` route; the tools rows in the presets stay mounted and keep working from the shared credential store and manager state.

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

A round-robin cursor belongs to one mounted tools entry, which means one preset revision. Sessions that share a preset share that cursor; different presets start from their own first call, so their first calls may select the same key. Rebuilding a preset revision or restarting the Harness resets the affected cursors. The strategy, key order, active flags, and 402 records come from the shared credential list and `~/.dsh/exa-manager.json`, so a strategy change or a 402 applies to every preset at its next call.

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
- The tools entry exposes no HTTP surface, so mounting it in a preset cannot add a route. Each mounted tools entry re-reads credentials per call and shares the manager state file; it keeps no key copy of its own.

## Package layout

| Path | Role |
| --- | --- |
| `src/index.js` | Host entry: management route, Client card carrier, startup credential check |
| `src/tools-entry.js` | Preset entry: three tools and the `tool:exa` prompt section |
| `src/tools.js` | Three tool definitions, validation, request mapping, projections, render |
| `src/exa-client.js` | Exa HTTP transport, active-key failover, 402 deactivation |
| `src/key-manager.js` | Credential reads/writes, key metadata and active state, primary synchronization, missing-key check |
| `src/backend.js` | `/api/exa-manager`, including key active-state changes |
| `src/lib.js` | Pure parsing, masking, active-key ordering, URL/date validation |
| `src/state.js` | Non-secret manager state, including active flags |
| `src/client.js` | Card source, serialized by the build script |
| `lib/client.js` | Built browser bundle, required by the `./client` export |
| `locale/en.json`, `locale/zh.json` | Plugin metadata and the card dictionaries used by the build |
| `scripts/build-client.mjs` | Inject the dictionaries and emit the module-loader bundle |

`package.json` maps the bare package name to `./src/index.js` and the `./tools` subpath to `./src/tools-entry.js`. Both resolve from the same installed directory; the profile needs no second dependency.

## Development

```bash
node scripts/build-client.mjs   # build lib/client.js
npm run check                   # syntax-check every source entry
node --test                    # unit and lifecycle tests
```

For local development, either run the package manager to install the declared DSH dev dependencies, or link the two DSH packages into `node_modules/@deepseek-ai` from the installation's `node_modules`. The tests use an in-memory credential service, a temporary `DSH_HOME`, and a mock `fetch`; they do not call Exa or consume credits.

The client build replaces the `__UI_DICTS__` placeholder inside `factory` with the `card` dictionaries from the two locale files, checks that their key sets match, wraps the factory in `window.__ModuleLoader__.load`, and runs `node --check` on the output. Editing `lib/client.js` directly is overwritten by the next build.

Test files follow the entry split: `test/host.test.js` mounts the Host entry and asserts that it registers one route and no tools or prompt sections; `test/tools-entry.test.js` mounts the preset entry, asserts three tools and one section with no route, and checks that two mounted entries keep independent round-robin cursors while sharing a 402 deactivation.

## Verification

The 0.4.0 checks below were run on 2026-11-02 against DSH `0.2.1-rc.5` in the Web profile, including the post-restart acceptance. The 0.4.1 change only expands the declared compatibility range and bumps the package version; `npm run check` and `node --test` were run on 2026-11-03 against the same `0.2.1-rc.5` baseline. DSH `0.2.2-alpha.3` was not executed, and the installed plugin was not modified. See [docs/verification.md](./docs/verification.md) for both records and their limits.

- `node scripts/build-client.mjs`, `npm run check`, and `node --test` pass; the suite runs 79 test cases, including the Host/preset split, independent cursors, shared 402 state, and the package export map.
- The 0.4.0 checkout was synchronized into `/home/andyk/.dsh-local-plugins/dsh-exa`, the link target of the profile's `dsh-exa` dependency. The installed `package.json` reports `0.4.0`, exports `./tools`, and `lib/client.js` has the same SHA-256 as the checkout.
- Both entries resolve from the profile base: `dsh-exa` → `src/index.js`, `dsh-exa/tools` → `src/tools-entry.js`.
- `dsh --profile web --dump-config` composes the `exa-tools` row into `standard-instant`, `ptc-instant`, and `cordis-ptc` only, keeps the single Host `dsh-exa` row, and leaves `chat-assistant` without an Exa row.
- The post-restart acceptance was completed on 2026-11-02. The Host row registered exactly one `/api/exa-manager` route; the Plugins card and its scope note rendered; `standard-instant`, `ptc-instant`, and `cordis-ptc` exposed the three tools in native or PTC form; `minimal`, `chat-assistant`, `standard`, `ptc`, and `cordis` exposed none; subagents followed the parent or explicitly selected preset; and disabling the Host row removed only the card and route. The outcomes matched the design expectations.
- Successful calls to the real Exa Search/Contents API were not executed because they consume the configured key's credits and no explicit cost approval was given.

## Documentation

The document map, status, and maintenance conventions are in [docs/README.md](./docs/README.md). The current record is [docs/verification.md](./docs/verification.md): its 0.4.1 section records the compatibility declaration, and its 0.4.0 section records the last runtime acceptance. The 0.4.0 architecture rationale is [docs/preset-separation-upgrade-plan.md](./docs/preset-separation-upgrade-plan.md).

## Non-goals

This release intentionally does not include Exa Agent, Research, or `agent_run`; Tavily-style `map` and `crawl` tools; a team credit-balance query; per-key usage history inside the card; automatic key reordering from usage history; a replacement for the built-in web tools; automatic re-enabling of keys after a top-up; automatic disabling of an existing MCP Exa server; Agent-facing key-management tools; per-preset API keys or state files; a cross-preset global round-robin cursor; or automatic preset wiring by the bundle.

## References

- Exa Search: <https://docs.exa.ai/reference/search>
- Exa Contents: <https://docs.exa.ai/reference/contents-api-guide-for-coding-agents>
- Exa Billing: <https://exa.ai/docs/admin/billing>
- Exa Billing dashboard: <https://dashboard.exa.ai/billing>
