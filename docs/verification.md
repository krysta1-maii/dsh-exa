# Verification record — dsh-exa 0.3.1

Date: 2026-10-29 (functional checks) and 2026-10-31 (compatibility update), Asia/Hong_Kong
Runtime: DeepSeek Harness 0.2.1-rc.3 for the functional checks; 0.2.1-rc.5 for the compatibility update
Install target: `/home/andyk/.dsh-local-plugins/dsh-exa`

## Automated checks

```bash
node scripts/build-client.mjs
npm run check
node --test
```

Results:

- The client build wrote `lib/client.js` and passed `node --check`.
- `npm run check` passed for all Host source files, the card factory, and the built bundle.
- `node --test` passed 69 test cases: 67 functional and lifecycle cases plus the manifest compatibility range and the request user agent. The runner also visits `test/helpers.js` as an empty test file.
- The tests use a temporary `DSH_HOME`, an in-memory credential service, and a mock `fetch`. No Exa request was made by the automated suite.

Covered by tests:

- Simple and advanced request mapping, including the nested `contents` object.
- Advanced validation, lite-mode rejections, date ordering, category restrictions, and URL limits.
- Canonical output validation against each tool's declared output schema.
- 401/402/429 failover, one attempt per key, aggregate failure diagnostics, non-retryable errors, network errors, and aborts.
- Priority and round-robin cursor behavior, including rotation, failover wrap, inactive-key skipping, and the first active key as the priority start.
- HTTP 402 auto-deactivation with persisted reason and timestamp; continuing to the next active key; `payment_required` when the last active key receives 402.
- All keys inactive at call start returns `payment_required` with no Exa request; the next call after every key is deactivated also makes no request.
- 401 and 429 do not change active state, and 400 responses leave the active set unchanged.
- Manager add/reveal/replace/remove/reorder, `setKeyActive`, all-inactive payload counts, the primary marker following the first active key, primary synchronization, read-only refs, strategy persistence, state timestamps, and `0600` state permissions.
- State cleanup on replace and remove, and active default for a re-added key.
- Client bundle construction and freshness, including the active-state action, active-count copy, all-inactive warning, the Billing URL, and the absence of the old usage route.
- Host mount and unmount: three tools, one route, and one prompt section appear and disappear without duplicates.
- Manifest compatibility: `engines.dsh`, the two DSH peer ranges, `dsh.compatibility.dsh`, and the `dshReleases` keys.

## Compatibility checks (2026-10-31)

The compatibility declarations were changed to cover the whole DSH `0.2.1` line:

| Field | Value |
| --- | --- |
| `engines.dsh` | `>=0.2.1-0 <0.2.2-0` |
| `peerDependencies` for `@deepseek-ai/dsh-home-paths` and `@deepseek-ai/dsh-tools` | `>=0.2.1-0 <0.2.2-0` |
| `dsh.compatibility.dsh` | `>=0.2.1-0 <0.2.2-0` |
| `dsh.compatibility.dshReleases` | `0.2.1-rc.3: compatible`, `0.2.1-rc.5: compatible` |

`evaluatePluginCompatibility` from the installed `@deepseek-ai/dsh-app-boot@0.2.1-rc.5` was called with the new manifest and `getDshRuntimeVersion()` returning `0.2.1-rc.5`. It returned `undefined`, meaning no requirement was unmet.

The range was evaluated against the semver library used by that host, once with `includePrerelease: true` (the Host's setting) and once with the default npm semantics:

- Accepted by both: all ten published 0.2.1 versions (`0.2.1-alpha.1` through `0.2.1-rc.5`), `0.2.1-rc.6`, and `0.2.1`.
- Rejected by both: `0.2.0-rc.2`, `0.2.2-0`, `0.2.2-alpha.1`, and `0.3.0`.

No Harness process was started on any 0.2.1 release other than rc.3 and rc.5. These decisions are range evaluations, not runtime sessions.

## Bundle installation (0.3.0, 2026-10-29)

The previous bundle was removed, then the updated package was installed from the local plugin directory:

- `remove_bundle`: `application: applied`, `changed: true`
- `install_bundle`: `application: applied`, `changed: true`
- bundle: `dsh-exa`
- version: `0.3.0`
- pnpm exit code: 0
- installed source: `link:/home/andyk/.dsh-local-plugins/dsh-exa`
- warnings: none

The installed `package.json` reports `0.3.0`, and the profile's dependency and resolved `node_modules/dsh-exa` link both point at the local plugin directory.

## 0.3.1 installation (2026-10-31)

The 0.3.1 checkout was synchronized into the same link target with `rsync -a --delete`, excluding `.git` and `node_modules`. No plugin-manager removal or installation ran for this version; the profile dependency remains `link:/home/andyk/.dsh-local-plugins/dsh-exa`.

- Installed `package.json` version: `0.3.1`
- Installed `engines.dsh`: `>=0.2.1-0 <0.2.2-0`
- Installed `dsh.compatibility.dsh`: `>=0.2.1-0 <0.2.2-0`; `dshReleases` records `0.2.1-rc.3` and `0.2.1-rc.5`
- The installed `package.json` and `lib/client.js` have the same SHA-256 values as the checkout
- A dry-run repeat of the same `rsync` reported no differences
- `evaluatePluginCompatibility` from the installed `@deepseek-ai/dsh-app-boot@0.2.1-rc.5` returned `undefined` for the installed manifest
- The profile's `node_modules/dsh-exa` symlink still resolves to `/home/andyk/.dsh-local-plugins/dsh-exa`

The running Harness process continued to use the 0.3.0 Host code. No restart was performed, so the 0.3.1 Host module has not been imported by the live process.

## Live Host checks (0.3.0, 2026-10-29)

The checks in this section and in Live route checks were recorded on 0.3.0 with DSH `0.2.1-rc.3`. The 0.3.1 package has not been loaded by a restarted Harness; its 0.3.1 changes relative to 0.3.0 are the manifest, the documentation, and the tests.

`cordis_inspect_query` `host/Tool.listTools` returned these three new entries:

- `exa_search`
- `exa_search_advanced`
- `exa_fetch`

`cordis_inspect_query` `client/Slots.listSubTree` with root `plugins.bundle.config` reported an active occupant:

```json
{
  "registrant": "Gb",
  "key": "dsh-exa",
  "id": "dsh-exa",
  "priority": 0,
  "active": true
}
```

A PTC dispatch of `exa_search` with an empty query returned:

```text
ToolCallError: query must be a non-empty string
```

That confirms the installed Host tool is reachable through the PTC surface. The success body and render were exercised with the mock-fetch tests.

## Live route checks

`GET /api/exa-manager`:

- HTTP 200
- `content-type: application/json; charset=utf-8`
- `cache-control: no-store`
- `x-content-type-options: nosniff`
- `ok: true`
- `source: "list"`
- two configured keys, masked only; no full key was printed or revealed
- `strategy: "priority"`
- `keys[*].active: true`
- `activeCount: 2`, `inactiveCount: 0`, `allInactive: false`
- `writable: { list: true, primary: true, add: true, edit: true }`

`POST /api/exa-manager` with `{"action":"setKeyActive","id":"k_0000000000000000","active":false}` returned HTTP 404:

```json
{"ok":false,"code":"key_not_found","error":"key not found"}
```

A follow-up `GET` still reported both keys active, so the new action is dispatched by the live Host and the probe did not change state. No live key was disabled, replaced, removed, reordered, or revealed. No strategy was changed.

The installed `lib/client.js` contains the `setKeyActive` request, the active/inactive switch, `keys.activeCount`, and `keys.allInactive`. The old `/api/exa-usage` route remains absent.

## Not executed

- Real Exa Search or Contents calls. The profile has configured keys, but the verification did not spend credits. Request mapping, projections, renders, and error paths are covered by mocks.
- A live HTTP 402 response, automatic deactivation, and the all-inactive lockout. Triggering them would consume credits or change the user's key state. The mock-fetch tests cover the persisted `http_402` reason, failover to the next active key, the immediate `payment_required` error, and the no-request 402 on a following call.
- Visual browser inspection. This environment provides slot registration and Client Inspect but no DOM or screenshot control. The card's built bundle was loaded with a stub React runtime, and the active-state controls are present in the bundle. A page refresh and visual check of light/dark, narrow layout, the switch, drag behavior, the new-tab click, and console errors remain unverified. No Web dev watcher was running in this session, so the browser page may still hold the previous client bundle until refreshed.
- A full Harness process restart was not performed. The old bundle was removed and the updated bundle installed in the live profile; Host teardown is covered by unit tests that dispose every effect and remount the plugin.
