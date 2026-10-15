/**
 * IX-6 close chords.
 * Terminal focused: Ctrl+W belongs to the shell. Ctrl+Shift+W closes the tab.
 * Any other surface: Ctrl+W closes the current tab. Ctrl+Shift+W closes it too.
 * A confirm or prompt that is already open is not a close — the caller checks isDialogOpen.
 */

export const CLOSE_TIP_ZH = 'Ctrl+W 关闭'
export const CLOSE_TIP_TERMINAL_ZH = 'Ctrl+Shift+W 关闭标签'
export const CLOSE_OTHERS_KEEP_ZH = '保留当前、已固定和运维首页'

export type CloseTipKey = 'tab.closeTip' | 'tab.closeTipTerminal'

export function closeControlTipKey(inTerminal: boolean): CloseTipKey {
  return inTerminal ? 'tab.closeTipTerminal' : 'tab.closeTip'
}
