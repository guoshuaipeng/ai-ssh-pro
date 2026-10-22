/**
 * c62: app-internal command bus. Features register a handler under a stable id
 * (connections.connect, snippets.add, sftp.transfer, ...); AI actions and other
 * callers run them by id. Handlers get already-validated args, resolved profiles
 * and the active session id, and return { ok, message }.
 */
import type { SavedSessionProfile } from './ipc'

export type CommandResult = { ok: boolean; message?: string }
export type CommandInput = { args: Record<string, string>; profiles: SavedSessionProfile[]; sessionId: string | null }
export type CommandHandler = (input: CommandInput) => Promise<CommandResult> | CommandResult

export type CommandBus = {
  register: (id: string, handler: CommandHandler) => void
  has: (id: string) => boolean
  ids: () => string[]
  /** null when no handler is registered under id. */
  run: (id: string, input: CommandInput) => Promise<CommandResult | null>
}

export function createCommandBus(): CommandBus {
  const handlers = new Map<string, CommandHandler>()
  return {
    register: (id, handler) => {
      handlers.set(id, handler)
    },
    has: (id) => handlers.has(id),
    ids: () => [...handlers.keys()],
    run: async (id, input) => {
      const h = handlers.get(id)
      return h ? await h(input) : null
    }
  }
}
