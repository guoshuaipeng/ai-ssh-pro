/** Opt-in hooks for local screenshot / visual QA. Never on unless localStorage says so. */

export const SCREENSHOT_HOOKS_KEY = "aiss.screenshot.hooks"

export function screenshotHooksEnabled(store: Pick<Storage, "getItem"> = globalThis.localStorage): boolean {
  try {
    return store.getItem(SCREENSHOT_HOOKS_KEY) === "1"
  } catch {
    return false
  }
}

export type ScreenshotOp =
  | { op: "aiConfirm"; preview?: string; requestId?: string }
  | { op: "knownHosts" }
  | { op: "sftp" }
  | { op: "sftpDual" }
  | { op: "sftpMockFill" }
  | { op: "theme"; id: "light" | "github-dark" | "sand" | "slate" }
  | { op: "dismissProduct" }
  | { op: "closeModals" }
  /** Visual QA: run a titlebar menu action (opsHome, settings, commandPalette, demoHost…). */
  | { op: "menu"; action: string }
  /** Visual QA: open the AI chat panel; seeds a short demo conversation unless `empty`. */
  | { op: "aiChat"; empty?: boolean }

export const SCREENSHOT_EVENT = "aiss-screenshot"

export function dispatchScreenshotOp(detail: ScreenshotOp): void {
  window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail }))
}

export type ScreenshotChatLine = {
  role: 'user' | 'assistant'
  content: string
  requestId?: string
  end?: { description: string; riskLevel: 'low' | 'medium' | 'high' }
}

/** Visual-QA fixture for the `aiChat` op (screenshot mode only, never shown to users): prose, a fenced block, inline code, a conclusion card. */
export const SCREENSHOT_AI_CHAT_DEMO: ScreenshotChatLine[] = [
  { role: 'user', content: 'web-01 上 nginx 返回 502，帮我看看' },
  {
    role: 'assistant',
    requestId: 'screenshot-chat-1',
    content:
      '502 通常是上游（php-fpm / 应用进程）没响应。先看 nginx 和上游的状态：\n\n```bash\nsystemctl status nginx --no-pager\nsudo tail -n 50 /var/log/nginx/error.log\n```\n\n如果日志里有 `connect() failed (111: Connection refused)`，说明上游没起来。'
  },
  { role: 'user', content: '日志里确实是 Connection refused' },
  {
    role: 'assistant',
    requestId: 'screenshot-chat-2',
    content: '',
    end: { description: '上游 php-fpm 未运行。重启后 502 应消失；若反复出现，检查 `pm.max_children` 与内存。', riskLevel: 'low' }
  }
]
