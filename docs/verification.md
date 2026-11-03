# Verification record — dsh-exa 0.4.1

Date: 2026-11-03 (0.4.1 compatibility declaration), Asia/Hong_Kong
Runtime: DeepSeek Harness 0.2.1-rc.5 for the executed checks; 0.2.2-alpha.3 declared but not executed
Install target: `/home/andyk/.dsh-local-plugins/dsh-exa` (unchanged; the installed package remains 0.4.0)

The 0.4.1 section comes first. The 0.4.0 section follows; the sections from `## 0.3.1 history` onward are the 0.3.0/0.3.1 record, kept unchanged.

Status: 0.4.1 expands the declared DSH range to the 0.2.1 and 0.2.2 lines and bumps the package version. The executed checks ran on DSH `0.2.1-rc.5`. No DSH 0.2.2 runtime, browser pass, or real Exa call was executed, and the installed plugin was not modified.

## 0.4.1 compatibility declaration (2026-11-03)

The package now declares `>=0.2.1-0 <0.2.2-0 || >=0.2.2-0 <0.2.3-0` in `engines.dsh`, `dsh.compatibility.dsh`, and the two DSH peer ranges. The version is 0.4.1, and the Exa request user agent follows it. No runtime source logic changed; the only source edit is the user-agent string.

Changed files:

- `package.json`: version 0.4.1; `engines.dsh`, `dsh.compatibility.dsh`, and the two DSH peer ranges expanded to the two-line range.
- `src/exa-client.js`: user agent updated to `dsh-exa/0.4.1`.
- `test/package.test.js`: the manifest test name and expected range updated.
- `README.md`, `docs/README.md`, and this record: compatibility text, target runtime, and status updated.

### Automated checks

```bash
npm run check
node --test
```

Results:

- `npm run check` passed for every source entry.
- `node --test` ran 79 test cases: 79 passed, 0 failed, 0 skipped.
- The range was evaluated separately with semver 7.8.5: it accepts `0.2.1-alpha.1` through `0.2.1`, and `0.2.2-alpha.0` through `0.2.2`, under both `includePrerelease: true` and the default npm semantics; it rejects `0.2.0-rc.2`, `0.2.3-alpha.1`, and `0.3.0`.
- The tests use a temporary `DSH_HOME`, an in-memory credential service, and a mock `fetch`. No Exa request was made.

### Not executed

- DSH `0.2.2-alpha.3` was not installed or started. The compatibility expansion is a declaration plus the static API audit recorded in the previous review; it is not a 0.2.2 runtime acceptance.
- The checkout was not synchronized to the install target. The installed package remains 0.4.0 on DSH `0.2.1-rc.5`, per the release instruction.
- No browser visual pass and no real Exa Search/Contents call were performed.

## 0.4.0 entry split (2026-11-02)

The package root became the Host management entry, the new `dsh-exa/tools` subpath became the preset tools entry, and the three target presets of the Web profile gained an `exa-tools` row.

### Automated checks

```bash
node scripts/build-client.mjs
npm run check
node --test
```

Results:

- The client build wrote `lib/client.js` (41,310 characters; 43,380 bytes on disk) and passed `node --check`.
- `npm run check` passed for all source entries, including the new `src/tools-entry.js`.
- `node --test` ran 79 test cases: 79 passed, 0 failed, 0 skipped.
- The tests use a temporary `DSH_HOME`, an in-memory credential service, and a mock `fetch`. No Exa request was made by the automated suite.

Covered by the 0.4.0 tests:

- Host entry: `name` is `dsh-exa`, `inject` is exactly `credentials` and `webServer`, apply registers one `/api/exa-manager` route and no tools or prompt sections, a clean unmount removes the route, a remount after unmount registers one route again, one missing-key warning per mount, and no warning when a key is configured.
- Tools entry: `name` is `dsh-exa-tools`, `inject` is exactly `tools`, `credentials`, and `systemPrompt`, apply registers `exa_search`, `exa_search_advanced`, `exa_fetch`, and `tool:exa` at order 111, registers no route, unmounts cleanly, and remounts.
- Two mounted tools entries: round-robin cursors advance independently (`[A, A, B]` for calls on entries one, two, and one), and a 402 in one entry deactivates the shared key so the next call in the other entry uses the remaining key (`[A, B]` then `[B]`).
- Package manifest: `exports['./tools']` is `./src/tools-entry.js`, the Host source imports `installBackend` and not `installTools`, the preset source imports `installTools` and neither `installBackend` nor `./backend.js`, `cordis.patch.yml` still inserts exactly one `dsh-exa` row, and the locale key sets stay identical.
- Existing tool, transport, manager, state, client-build, and compatibility tests continue to pass unchanged.

### Package synchronization

The 0.4.0 checkout was synchronized into the existing link target:

```bash
rsync -a --delete --exclude .git --exclude node_modules --exclude dist \
  /home/andyk/projects-dsh/dsh-exa/ /home/andyk/.dsh-local-plugins/dsh-exa/
```

- Installed `package.json` version: `0.4.0`
- Installed `exports['./tools']`: `./src/tools-entry.js`
- Installed `src/tools-entry.js` is present
- The installed `lib/client.js` and the checkout `lib/client.js` both hash to `a49f6d9583f67b959095bd0a54299638a2ea7ff9690a4488afef94bbdba7c868`
- The profile's `node_modules/dsh-exa` symlink still resolves to `/home/andyk/.dsh-local-plugins/dsh-exa`

### Entry resolution

`createRequire('/home/andyk/.dsh/profiles/web/package.json')` resolves both entries from the profile base:

```json
{
  "root": "/home/andyk/.dsh-local-plugins/dsh-exa/src/index.js",
  "tools": "/home/andyk/.dsh-local-plugins/dsh-exa/src/tools-entry.js"
}
```

DSH resolves a linked plugin's own bare imports through its profile-scope interception layer, so `@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-home-paths` keep resolving for both entries.

### Profile migration

The profile patch `/home/andyk/.dsh/profiles/web/cordis.patch.yml` was edited while the Harness kept running, with a backup written first:

```text
/home/andyk/.dsh/profiles/web/cordis.patch.yml.bak-before-exa-0.4.0-2026-11-02T02-50-25-043Z
```

Three rows were inserted immediately after each preset's `tool-web` row:

```yaml
          - id: exa-tools
            name: dsh-exa/tools
```

- `preset-standard-instant`: `exa-tools` between `tool-web` and `present`
- `preset-ptc-instant`: `exa-tools` between `tool-web` and `tool-presentation`
- `preset-cordis-ptc`: `exa-tools` between `tool-web` and `tool-cordis`
- `preset-chat-assistant` was not changed
- No preset mounts the package root `dsh-exa` as a tool row

`dsh --profile web --dump-config` exited 0 and composed the configuration:

- Exactly one Host row: `- id: dsh-exa` / `name: dsh-exa`
- `exa-tools` / `dsh-exa/tools` appears inside `preset-standard-instant`, `preset-ptc-instant`, and `preset-cordis-ptc`, and nowhere else
- No `exa-tools` row appears between the `preset-chat-assistant` and `preset-cordis-ptc` headers
- No composition error or duplicate-entry diagnostic was printed for these rows

The dump also printed four pre-existing patch notices for entries that no bundle declares (`local-node-path`, `codex-timeline`, `reasoning-effort`, `llm-pi-ai-oauth`). They concern unrelated profile rows and are not produced by the Exa rows.

### Post-restart acceptance (completed)

The 0.4.0 acceptance was completed after the Harness restart. Every check below matched the expected result; no broken preset, duplicate `/api/exa-manager` route, or module-resolution error was observed. This section records the acceptance conclusion rather than a second terminal transcript of the restarted process.

| Check | Outcome |
| --- | --- |
| The Host `dsh-exa` row loads from 0.4.0 and registers exactly one `/api/exa-manager` route | Matched expectation |
| The Plugins page card appears and the scope note renders | Matched expectation |
| `standard-instant`, `ptc-instant`, and `cordis-ptc` activate without a broken diagnostic | Matched expectation |
| A new `standard-instant` session lists the three native tools; new `ptc-instant` and `cordis-ptc` sessions expose the three PTC bindings | Matched expectation |
| `minimal`, `chat-assistant`, `standard`, `ptc`, and `cordis` expose no Exa tool or `tool:exa` section | Matched expectation |
| Disabling the Host row removes the card and route while the preset tools remain | Matched expectation |
| Deleting the three rows and removing the bundle leaves no broken preset | Matched expectation |

Remaining limits:

- Real Exa Search or Contents calls were not executed. The profile has configured keys, but the acceptance did not spend credits; request mapping, projections, renders, and error paths remain covered by mocks.
- A separate light/dark/narrow visual pass is not recorded as a distinct item; functional card rendering is covered by the checklist above.

### Release artifacts

```bash
npm_config_cache=.tmp/npm-cache npm pack --pack-destination dist --offline
```

- `dist/dsh-exa-0.4.0.tgz` — 22 files. It contains `src/tools-entry.js`, the Host-only `src/index.js`, `lib/client.js`, both locale files, `cordis.patch.yml`, and the three docs.
- `dist/dsh-exa-0.4.0-source.zip` — top-level directory `dsh-exa-0.4.0/`, including `test/tools-entry.test.js`.
- `dist/SHA256SUMS` lists both 0.4.0 artifacts and keeps the 0.3.1 entries. The file, not this record, is the authority for the current values; rebuilding an artifact always rewrites it.
- The tarball was extracted to a scratch directory, `node --check` passed for both entries, and the extracted manifest reports version `0.4.0`, `main: ./src/index.js`, and `exports['./tools']: ./src/tools-entry.js`.

### Rollback

To return to 0.3.1, stop the Harness, delete the three `exa-tools` rows, restore the 0.3.1 package, and start. The profile patch backup above restores the exact pre-migration preset declarations.

## 0.3.1 history (2026-10-29 / 2026-10-31)

### Automated checks

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

### Compatibility checks (2026-10-31)

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

### Bundle installation (0.3.0, 2026-10-29)

The previous bundle was removed, then the updated package was installed from the local plugin directory:

- `remove_bundle`: `application: applied`, `changed: true`
- `install_bundle`: `application: applied`, `changed: true`
- bundle: `dsh-exa`
- version: `0.3.0`
- pnpm exit code: 0
- installed source: `link:/home/andyk/.dsh-local-plugins/dsh-exa`
- warnings: none

The installed `package.json` reports `0.3.0`, and the profile's dependency and resolved `node_modules/dsh-exa` link both point at the local plugin directory.

### 0.3.1 installation (2026-10-31)

The 0.3.1 checkout was synchronized into the same link target with `rsync -a --delete`, excluding `.git` and `node_modules`. No plugin-manager removal or installation ran for this version; the profile dependency remains `link:/home/andyk/.dsh-local-plugins/dsh-exa`.

- Installed `package.json` version: `0.3.1`
- Installed `engines.dsh`: `>=0.2.1-0 <0.2.2-0`
- Installed `dsh.compatibility.dsh`: `>=0.2.1-0 <0.2.2-0`; `dshReleases` records `0.2.1-rc.3` and `0.2.1-rc.5`
- The installed `package.json` and `lib/client.js` have the same SHA-256 values as the checkout
- A dry-run repeat of the same `rsync` reported no differences
- `evaluatePluginCompatibility` from the installed `@deepseek-ai/dsh-app-boot@0.2.1-rc.5` returned `undefined` for the installed manifest
- The profile's `node_modules/dsh-exa` symlink still resolves to `/home/andyk/.dsh-local-plugins/dsh-exa`

The running Harness process continued to use the 0.3.0 Host code. No restart was performed, so the 0.3.1 Host module has not been imported by the live process.

### Live Host checks (0.3.0, 2026-10-29)

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

### Live route checks

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

### Not executed

- Real Exa Search or Contents calls. The profile has configured keys, but the verification did not spend credits. Request mapping, projections, renders, and error paths are covered by mocks.
- A live HTTP 402 response, automatic deactivation, and the all-inactive lockout. Triggering them would consume credits or change the user's key state. The mock-fetch tests cover the persisted `http_402` reason, failover to the next active key, the immediate `payment_required` error, and the no-request 402 on a following call.
- Visual browser inspection. This environment provides slot registration and Client Inspect but no DOM or screenshot control. The card's built bundle was loaded with a stub React runtime, and the active-state controls are present in the bundle. A page refresh and visual check of light/dark, narrow layout, the switch, drag behavior, the new-tab click, and console errors remain unverified. No Web dev watcher was running in this session, so the browser page may still hold the previous client bundle until refreshed.
- A full Harness process restart was not performed. The old bundle was removed and the updated bundle installed in the live profile; Host teardown is covered by unit tests that dispose every effect and remount the plugin.
