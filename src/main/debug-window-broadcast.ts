import type { WebContents } from 'electron'
import type { AiDebugStreamPayload } from '../shared/ipc'

let target: WebContents | null = null

export function setDebugWindowWebContents(wc: WebContents | null): void {
  target = wc
}

/** 将调试条目推送到独立调试窗口（若已打开） */
export function forwardDebugPayloadToWindow(payload: AiDebugStreamPayload): void {
  const t = target
  if (!t || t.isDestroyed()) {
    target = null
    return
  }
  t.send('ai-debug:push', payload)
}
