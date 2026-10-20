/** Opt-in hooks for local screenshot / visual QA. Never on unless localStorage says so. */
import type { ExecRecord } from '@shared/ai-exec-replay'

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
  /** 2.3: execution replay record, as restored from history. */
  exec?: ExecRecord
}

/** Visual-QA fixture for the `aiChat` op (screenshot mode only, never shown to users): a suggested command, a numbered answer, prose with a fenced block. */
export const SCREENSHOT_AI_CHAT_DEMO: ScreenshotChatLine[] = [
  { role: 'user', content: 'web-01 上 nginx 返回 502，帮我看看' },
  {
    role: 'assistant',
    requestId: 'screenshot-chat-1',
    elapsedMs: 9000,
    content:
      '502 通常是上游（php-fpm / 应用进程）没响应。先看 nginx 和上游的状态：\n\n```bash\nsystemctl status nginx --no-pager\nsudo tail -n 50 /var/log/nginx/error.log\n```\n\n如果日志里有 `connect() failed (111: Connection refused)`，说明上游没起来。再确认 80 端口被谁占用：\n\n```bash\nss -ltnp | grep :80\n```'
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
    },
    exec: {
      status: 'ok',
      exitCode: 0,
      at: Date.UTC(2026, 9, 20, 6, 12, 41),
      durationMs: 1240,
      outputLines: 11,
      auditId: 'aud-shot-ps',
      summary:
        'root     20517  2.1  7.5 9812344 7412236 ?  Ssl  Oct18  52:10 /usr/bin/containerd\napp      26383  1.4  4.8 8123412 4791220 ?  Sl   Oct19  31:02 java -jar app.jar\nroot      1187  3.0  4.5 6012388 4420912 ?  Ssl  Oct18  80:44 /usr/local/bin/k3s server\nnexus     3011  0.6  4.3 7340032 4251108 ?  Sl   Oct18  12:37 nexus run\nloki      4120  0.4  2.6 3145728 2560112 ?  Ssl  Oct18   9:15 loki -config.file=/etc/loki.yaml'
    }
  },
  {
    role: 'assistant',
    content: '',
    elapsedMs: 3000,
    command: {
      description: '重启 nginx 以加载新的上游配置。',
      command: 'systemctl restart nginx',
      riskLevel: 'medium'
    },
    exec: {
      status: 'failed',
      at: Date.UTC(2026, 9, 20, 6, 13, 5),
      durationMs: 860,
      exitCode: 1,
      outputLines: 2,
      summary: 'Job for nginx.service failed because the control process exited with error code.\nSee "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.'
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
