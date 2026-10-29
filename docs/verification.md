# Verification record — dsh-exa 0.1.0

Date: 2026-10-29 (Asia/Hong_Kong)
Runtime: DeepSeek Harness 0.2.1-rc.3, Web profile
Install target: `/home/andyk/projects-dsh/dsh-exa`

## Automated checks

```bash
node scripts/build-client.mjs
node --test
node --check src/index.js
node --check src/client.js
```

Results:

- Client build wrote `lib/client.js` and passed `node --check`.
- `node --test` passed 66 test cases across eight test files. The runner also visits `test/helpers.js` as an empty test file.
- The tests use a temporary `DSH_HOME`, an in-memory credential service, and a mock `fetch`. No Exa request was made by the automated suite.

Covered by tests:

- Simple and advanced request mapping, including the nested `contents` object.
- Advanced validation, lite-mode rejections, date ordering, category restrictions, and URL limits.
- Canonical output validation against each tool's declared output schema.
- 401/402/429 failover, one attempt per key, aggregate failure diagnostics, non-retryable errors, network errors, and aborts.
- Priority and round-robin cursor behavior, including rotation and failover wrap.
- Manager add/reveal/replace/remove/reorder, primary synchronization, read-only refs, state timestamps, and `0600` state permissions.
- Usage mapping, budgets, breakdowns, per-row failures, unlinked keys, Admin 401, caching, refresh bypass, and range limits.
- Host mount and unmount: three tools, two routes, and one prompt section appear and disappear without duplicates.

## Bundle installation

The first `plugin_manager install_bundle` call reached the client-side run deadline before making any profile change. A second call completed:

- `application: applied`
- `stage: enable`
- bundle: `dsh-exa`
- version: `0.1.0`
- pnpm exit code: 0
- installed source: `link:../../../projects-dsh/dsh-exa`
- warnings: none

The profile patch now selects the `dsh-exa` bundle; the bundle patch inserts the row `dsh-exa` pointing at package `dsh-exa`.

## Live Host checks

`cordis_inspect_query` `host/Tool.listTools` returned exactly these new entries:

- `exa_search`
- `exa_search_advanced`
- `exa_fetch`

`web_search` and `web_fetch` remained in the catalog. The package registers no web provider and does not touch `ctx.web`.

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
- `ok: true`
- `source: "primary"`
- one configured key, masked; no full key was printed or revealed
- `strategy: "priority"`
- `writable: { list: true, primary: true, service: true, add: true, edit: true }`
- `serviceKey.configured: false`

`GET /api/exa-usage` without a service key:

- HTTP 200
- `cache-control: no-store`
- `ok: true`
- `configured: false`
- `rows: []`
- `message: "Team Management service key is not configured"`
- normalized default range: 2026-09-29 through 2026-10-29

The manager route was queried only for its redacted payload. The reveal endpoint was not called against the user's key. No key list mutation, strategy change, service-key change, or state write was performed against the live profile.

## Not executed

- Real Exa Search or Contents calls. The profile has one configured search key, but the plan requires explicit confirmation before spending credits; no such confirmation was given. Request mapping, projections, renders, and error paths are covered by mocks.
- Real Team Management calls. No service key is configured, so the Admin adapter was not exercised against Exa. `GET /api/exa-usage` returned the designed `configured: false` payload.
- Visual browser inspection. This environment provides slot registration and Client Inspect but no DOM or screenshot control. The card's built bundle was loaded with a stub React runtime and its slot registration and summary view were verified; light/dark, narrow layout, drag behavior, and console errors remain unverified.
- Live unload/reload through `plugin_manager`. The session approval policy changed to reject plugin-manager actions after installation. Host teardown is covered by unit tests that dispose every effect and remount the plugin.
