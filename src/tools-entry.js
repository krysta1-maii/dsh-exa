/**
 * dsh-exa preset entry: the three Exa tools and the tool:exa prompt section.
 *
 * Agent presets mount this entry by name (dsh-exa/tools). It registers no HTTP
 * route and no Client resource, so several presets may mount it at the same
 * time; each mounting composition keeps its own tool registrations and its own
 * round-robin cursor. Credentials and manager state stay shared with the Host
 * entry through the credential service and ~/.dsh/exa-manager.json.
 */
import { installTools } from './tools.js'

export const name = 'dsh-exa-tools'

export const inject = ['tools', 'credentials', 'systemPrompt']

export function apply(ctx) {
  ctx.effect(() => installTools(ctx), 'dsh-exa: tools')
}
