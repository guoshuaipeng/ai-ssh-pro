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
  /** Visual QA (M22): open the first saved host's profile on its 安全 card (read-only + 自动执行 → capped). */
  | { op: "hostSafety" }
  /** Visual QA (M25): open a composer chip popover (model menu or safety policy). */
  | { op: "aiComposerPop"; which: "model" | "safety" }

export const SCREENSHOT_EVENT = "aiss-screenshot"

export function dispatchScreenshotOp(detail: ScreenshotOp): void {
  window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail }))
}

export type ScreenshotChatLine = {
  role: 'user' | 'assistant'
  content: string
  requestId?: string
  end?: { description: string; riskLevel: 'low' | 'medium' | 'high' }
  /** M19: a suggested command step (rendered as the compact command block). */
  command?: { description: string; command: string; riskLevel: 'low' | 'medium' | 'high' }
  elapsedMs?: number
}

/** Visual-QA fixture for the `aiChat` op (screenshot mode only, never shown to users): a suggested command, a numbered answer, prose with a fenced block. */
export const SCREENSHOT_AI_CHAT_DEMO: ScreenshotChatLine[] = [
  { role: 'user', content: 'web-01 上 nginx 返回 502，帮我看看' },
  {
    role: 'assistant',
    requestId: 'screenshot-chat-1',
    elapsedMs: 9000,
    content:
      '502 通常是上游（php-fpm / 应用进程）没响应。先看 nginx 和上游的状态：\n\n```bash\nsystemctl status nginx --no-pager\nsudo tail -n 50 /var/log/nginx/error.log\n```\n\n如果日志里有 `connect() failed (111: Connection refused)`，说明上游没起来。'
  },
  { role: 'user', content: '再列一下占用内存最高的进程' },
  {
    role: 'assistant',
    content: '',
    elapsedMs: 4000,
    command: {
      description: '按内存占用降序列出前 10 个进程（含表头）。只读，无副作用。',
      command: 'ps aux --sort=-%mem | head -n 11',
      riskLevel: 'low'
    }
  },
  {
    role: 'assistant',
    content: '',
    requestId: 'screenshot-chat-2',
    elapsedMs: 12000,
    end: {
      description:
        '1. 内存占用最高的是 containerd（PID 20517），占 7.5% 物理内存（约 7.4GB），属系统级容器运行时，不可终止。\n2. 第二是 Java 进程（PID 26383），占 4.8%（约 4.8GB），运行 app.jar，监听调试端口 5101。\n3. 其余为 k3s server（4.5%）、Nexus（4.3%）、Loki（2.6%）等，均符合测试环境多容器部署特征。',
      riskLevel: 'low'
    }
  }
]
