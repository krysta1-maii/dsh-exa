/**
 * dsh-exa Host entry.
 *
 * The package registers exactly three model tools and a Plugins-page
 * management card backed by one exact web route. It never registers a web
 * search provider and never changes ctx.web, so the built-in web_search and
 * web_fetch keep their native providers and schemas.
 */
import { installBackend } from './backend.js'
import { installTools } from './tools.js'

export const name = 'dsh-exa'

export const inject = ['tools', 'webServer', 'credentials', 'systemPrompt']

export function apply(ctx) {
  // The owning fiber disposes tools, the prompt section, and the management
  // route when the row is disabled or the bundle is unloaded.
  ctx.effect(() => installTools(ctx), 'dsh-exa: tools')
  installBackend(ctx)
}
