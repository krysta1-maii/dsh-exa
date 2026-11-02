/**
 * dsh-exa Host entry: the Plugins-page management card, its exact
 * /api/exa-manager route, and one startup check for a missing Exa key.
 *
 * This entry registers no model tools and no tool:exa system prompt. Those
 * live in the separate dsh-exa/tools entry that agent presets mount, so each
 * preset decides whether its agents receive the Exa tools. Keeping the route
 * here means several presets can mount the tools entry without registering a
 * second /api/exa-manager route.
 *
 * The package never registers a web search provider and never changes
 * ctx.web, so the built-in web_search and web_fetch keep their native
 * providers and schemas.
 */
import { installBackend } from './backend.js'
import { warnIfNoKeys } from './key-manager.js'

export const name = 'dsh-exa'

export const inject = ['webServer', 'credentials']

export function apply(ctx) {
  // The owning fiber disposes the management route when the row is disabled or
  // the bundle is unloaded.
  installBackend(ctx)
  // The check runs once per Host mount rather than once per preset tools mount.
  warnIfNoKeys(ctx)
}
