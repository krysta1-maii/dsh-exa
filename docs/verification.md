# Verification record — dsh-exa 0.2.0

Date: 2026-10-29 (Asia/Hong_Kong)
Runtime: DeepSeek Harness 0.2.1-rc.3, Web profile
Install target: `/home/andyk/.dsh-local-plugins/dsh-exa`

## Automated checks

```bash
node scripts/build-client.mjs
npm run check
node --test
```

Results:

- Client build wrote `lib/client.js` and passed `node --check`.
- `node --test` passed 52 test cases. The runner also visits `test/helpers.js` as an empty test file.
- The tests use a temporary `DSH_HOME`, an in-memory credential service, and a mock `fetch`. No Exa request was made by the automated suite.

Covered by tests:

- Simple and advanced request mapping, including the nested `contents` object.
- Advanced validation, lite-mode rejections, date ordering, category restrictions, and URL limits.
- Canonical output validation against each tool's declared output schema.
- 401/402/429 failover, one attempt per key, aggregate failure diagnostics, non-retryable errors, network errors, and aborts.
- Priority and round-robin cursor behavior, including rotation and failover wrap.
- Manager add/reveal/replace/remove/reorder, primary synchronization, read-only refs, strategy persistence, state timestamps, and `0600` state permissions.
- The manager route no longer returns service-key fields or registers the usage route.
- Client bundle construction and freshness, including the Billing URL and the absence of the old usage route.
- Host mount and unmount: three tools, one route, and one prompt section appear and disappear without duplicates.

## Bundle installation

The previous bundle was removed, then the updated package was installed from the local plugin directory:

- `remove_bundle`: `application: applied`, `changed: true`
- `install_bundle`: `application: applied`, `changed: true`
- bundle: `dsh-exa`
- version: `0.2.0`
- pnpm exit code: 0
- installed source: `link:/home/andyk/.dsh-local-plugins/dsh-exa`
- warnings: none

The profile's dependency and resolved `node_modules/dsh-exa` link both point at the local plugin directory. The installed package has no `src/usage.js` and no `test/usage.test.js`.

## Live Host checks

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
- `ok: true`
- `source: "primary"`
- one configured key, masked; no full key was printed or revealed
- `strategy: "priority"`
- `writable: { list: true, primary: true, add: true, edit: true }`
- no `serviceKey` field

The old `/api/exa-usage` route is not registered by the plugin; the Host test asserts that only `/api/exa-manager` is present. In the unauthenticated live probe, `/api/exa-usage` received the same `401 unauthorized` response as an arbitrary `/api/nope` path, so no plugin handler or Admin API call ran.

The installed `lib/client.js` contains `https://dashboard.exa.ai/billing` and does not contain `/api/exa-usage`. The Billing button opens that URL in a new tab.

The manager route was queried only for its redacted payload. The reveal endpoint was not called against the user's key. No key list mutation, strategy change, service-key change, or state write was performed against the live profile.

## Not executed

- Real Exa Search or Contents calls. The profile has one configured search key, but the verification did not spend credits. Request mapping, projections, renders, and error paths are covered by mocks.
- Visual browser inspection. This environment provides slot registration and Client Inspect but no DOM or screenshot control. The card's built bundle was loaded with a stub React runtime, and the Billing URL is present in the bundle; light/dark, narrow layout, drag behavior, the actual new-tab click, and console errors remain unverified.
- A full Harness process restart was not performed. The old bundle was removed and the updated bundle installed in the live profile; Host teardown is covered by unit tests that dispose every effect and remount the plugin.
