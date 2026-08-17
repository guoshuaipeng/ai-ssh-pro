import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { SshHostKeyPromptEvent } from '../shared/ipc'

export type HostKeyPromptResult = {
  accept: boolean
  alwaysTrust: boolean
}

type Waiter = {
  resolve: (result: HostKeyPromptResult) => void
  timer: ReturnType<typeof setTimeout>
}

const waiters = new Map<string, Waiter>()

const PROMPT_TIMEOUT_MS = 120_000

export function resolveHostKeyPrompt(
  requestId: string,
  accept: boolean,
  alwaysTrust = true
): boolean {
  const w = waiters.get(requestId)
  if (!w) return false
  clearTimeout(w.timer)
  waiters.delete(requestId)
  w.resolve({ accept, alwaysTrust: Boolean(alwaysTrust) })
  return true
}

export function abortAllHostKeyPrompts(): void {
  for (const [id, w] of waiters) {
    clearTimeout(w.timer)
    w.resolve({ accept: false, alwaysTrust: false })
    waiters.delete(id)
  }
}

/** Ask the renderer to confirm a new/changed host key. */
export function promptHostKey(
  owner: WebContents,
  payload: Omit<SshHostKeyPromptEvent, 'requestId'>
): Promise<HostKeyPromptResult> {
  if (owner.isDestroyed()) return Promise.resolve({ accept: false, alwaysTrust: false })

  const requestId = randomUUID()
  const event: SshHostKeyPromptEvent = { ...payload, requestId }

  return new Promise<HostKeyPromptResult>((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(requestId)
      resolve({ accept: false, alwaysTrust: false })
    }, PROMPT_TIMEOUT_MS)

    waiters.set(requestId, { resolve, timer })

    try {
      owner.send('ssh:hostKeyPrompt', event)
    } catch {
      clearTimeout(timer)
      waiters.delete(requestId)
      resolve({ accept: false, alwaysTrust: false })
    }
  })
}
