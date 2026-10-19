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

export const SCREENSHOT_EVENT = "aiss-screenshot"

export function dispatchScreenshotOp(detail: ScreenshotOp): void {
  window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail }))
}
