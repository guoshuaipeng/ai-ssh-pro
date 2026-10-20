/**
 * B1：AI 命令退出码采集。
 * AI 写入终端的命令末尾追加一段 printf，命令结束后输出一个不可见的 OSC 777 标记（携带本次 nonce 与 $?）。
 * 主进程从输出流中解析并剥离标记；xterm 会忽略未知 OSC，所以终端里看不到标记本身，
 * 但命令回显里会多出这段 printf（已在设置中说明，可关闭）。
 */
import { isInteractiveCommand } from './safety-tier'

export const EXIT_OSC = '\x1b]777;aiss-exit;'
const BEL = '\x07'
const ST = '\x1b\\'

/** 不适合追加标记的命令：交互式、后台运行、续行、heredoc、多行、以连接符结尾 */
export function exitMarkerEligible(command: string): boolean {
  const c = String(command ?? '').trim()
  if (!c || /[\r\n]/.test(c)) return false
  if (c.length > 2000) return false
  if (isInteractiveCommand(c)) return false
  if (/<</.test(c)) return false
  if (/(^|[^&])&\s*$/.test(c)) return false
  if (/(\\|\|\||&&|\|)\s*$/.test(c)) return false
  // 进入别的 shell / 会话后，标记会落在另一个环境里
  if (/^(exec|exit|logout|su|sudo\s+-[is]|sudo\s+su|ssh|tmux|screen|telnet|mysql|psql|redis-cli|python3?|node)(\s|$)/.test(c) && !/^(python3?|node)\s+\S/.test(c)) return false
  // 不带脚本的 shell 会进入新的交互 shell；`sh -c "..."` / `bash x.sh` 可以
  if (/^(bash|sh|zsh|fish|dash|ksh)(\s+-[a-zA-Z]+)*\s*$/.test(c)) return false
  return true
}

/** 返回写入终端的命令行（不含换行）；不适合时返回原命令 */
export function wrapWithExitMarker(command: string, nonce: string): { wire: string; marked: boolean } {
  const c = String(command ?? '').trim()
  if (!exitMarkerEligible(c) || !/^[a-z0-9]{4,16}$/.test(nonce)) return { wire: c, marked: false }
  const base = c.replace(/;\s*$/, '')
  return { wire: `${base}; printf '\\033]777;aiss-exit;%s;%d\\007' ${nonce} $?`, marked: true }
}

/** 命令回显里的 printf 后缀（含终端折行时插入的回车换行），用于从给 AI / 回放的文本里去掉 */
const ECHO_SUFFIX = /;[ \r\n]*p[\r\n]*r[\r\n]*i[\r\n]*n[\r\n]*t[\r\n]*f[ \r\n]+'\\033\]777;aiss-exit;[^']*'[ \r\n]+[a-z0-9]{4,16}[ \r\n]+\$\?/g
export function stripEchoedMarker(text: string): string {
  return text.replace(ECHO_SUFFIX, '')
}

export type ExitHit = { nonce: string; code: number }

/** 流式解析：跨 chunk 的半截标记会暂存到下一次 */
export class ExitMarkerParser {
  private carry = ''
  feed(chunk: string): { clean: string; exits: ExitHit[] } {
    let text = this.carry + chunk
    this.carry = ''
    const exits: ExitHit[] = []
    let out = ''
    for (;;) {
      const i = text.indexOf(EXIT_OSC)
      if (i < 0) break
      const rest = text.slice(i + EXIT_OSC.length)
      const endBel = rest.indexOf(BEL)
      const endSt = rest.indexOf(ST)
      const end = endBel < 0 ? endSt : endSt < 0 ? endBel : Math.min(endBel, endSt)
      if (end < 0) {
        if (rest.length > 64) {
          // 不像标记，原样放行
          out += text.slice(0, i + EXIT_OSC.length)
          text = rest
          continue
        }
        out += text.slice(0, i)
        this.carry = text.slice(i)
        return { clean: out, exits }
      }
      const body = rest.slice(0, end)
      const m = /^([a-z0-9]{4,16});(-?\d{1,3})$/.exec(body)
      if (m) exits.push({ nonce: m[1], code: Number(m[2]) })
      out += text.slice(0, i)
      text = rest.slice(end + (end === endBel ? BEL.length : ST.length))
    }
    // 结尾可能是标记前缀的一部分
    for (let k = Math.min(EXIT_OSC.length - 1, text.length); k > 0; k--) {
      if (EXIT_OSC.startsWith(text.slice(-k))) {
        this.carry = text.slice(-k)
        text = text.slice(0, -k)
        break
      }
    }
    return { clean: out + text, exits }
  }
}

export function newExitNonce(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0')
}
