/** 与 TerminalPane 约定：将文本 paste 进 xterm（走 onData → ssh.write）；execute 为 true 时在末尾附带回车一并发送 */
export const AISS_INJECT_TERMINAL_EVENT = 'aiss-inject-terminal'

export function dispatchInjectTerminal(sessionId: string, text: string, execute?: boolean): void {
  window.dispatchEvent(
    new CustomEvent(AISS_INJECT_TERMINAL_EVENT, {
      detail: { sessionId, text, execute: Boolean(execute) }
    })
  )
}
