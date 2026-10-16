/** P11-6: loading and failures stay quiet. They do not take the keyboard, and they do not print a stack. */

import { isEngineerLeak, noticeHost, noticeKind } from './product-error'
import { disconnectStatusSentence } from './status-bar'

const STACK = /(?:^|\n)\s*at\s+\S+/

/** Attributes for a loading line. tabIndex -1 so it cannot become the focused control. */
export const QUIET_LOAD_ATTRS = { tabIndex: -1 as const, 'data-quiet-load': '' }

/** Loading never moves focus onto itself. */
export function loadingStealsFocus(): false {
  return false
}

export type QuietOffer = 'retry' | 'settings'

/**
 * A sentence a person can read, plus the one next step that fits.
 * Dropped connections use the status-bar sentence. Auth and permission point at Settings.
 * Stacks and IPC channel names never come through.
 */
export function quietFailureCopy(
  raw: string,
  locale: 'zh-CN' | 'en',
  host = ''
): { message: string; offer: QuietOffer } {
  const text = String(raw ?? '').trim()
  const kind = noticeKind(text)
  const leaked = !text || isEngineerLeak(text) || STACK.test(text)
  const zh = locale !== 'en'
  if (kind === 'auth') {
    return {
      message: zh ? '登录没有通过。到设置里核对密钥' : 'Sign-in was not accepted. Check the key in Settings',
      offer: 'settings'
    }
  }
  if (kind === 'permission') {
    return {
      message: zh ? '没有权限。到设置里核对这一项' : 'Permission was denied. Check it in Settings',
      offer: 'settings'
    }
  }
  if (kind === 'dropped' || kind === 'unreachable') {
    const name = leaked ? '' : host || noticeHost(text)
    return { message: disconnectStatusSentence(name, locale), offer: 'retry' }
  }
  if (leaked) {
    return {
      message: zh ? '没有完成。可以再试一次' : 'That did not finish. You can try again',
      offer: 'retry'
    }
  }
  const first = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !/^at\s+/.test(line))
  if (!first || isEngineerLeak(first)) {
    return {
      message: zh ? '没有完成。可以再试一次' : 'That did not finish. You can try again',
      offer: 'retry'
    }
  }
  return { message: first.slice(0, 180), offer: 'retry' }
}
