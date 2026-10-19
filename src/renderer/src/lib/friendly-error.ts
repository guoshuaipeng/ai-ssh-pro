/** UX-35: strip Electron IPC prefixes and map common errors to readable copy. */

import { classifyHopReason, parseHopFailure } from '@shared/jump-chain'
import { friendlyAiHttpError, parseAiHttpErrorMessage } from '@shared/ai-http-error'

export type FriendlyError = { message: string; detail?: string; code?: string }

const IPC_PREFIX = /^Error invoking remote method '[^']+':\s*/i
const ERR_PREFIX = /^Error:\s*/i

export function stripIpcPrefix(raw: string): string {
  let s = String(raw ?? '').trim()
  for (let i = 0; i < 6; i++) {
    const next = s.replace(IPC_PREFIX, '').replace(ERR_PREFIX, '').trim()
    if (next === s) break
    s = next
  }
  return s
}

type Locale = 'zh-CN' | 'en'

function mapKnown(clean: string, locale: Locale): { message: string; code: string } | null {
  const zh = locale === 'zh-CN'
  const hop = parseHopFailure(clean)
  if (hop) {
    const kind = classifyHopReason(hop.reason)
    const where = zh
      ? `跳板「${hop.name}」（第 ${hop.hop}/${hop.total} 跳）`
      : `Jump host "${hop.name}" (hop ${hop.hop}/${hop.total})`
    const byKind: Record<string, string> = zh
      ? {
          auth: `${where}用户名或密钥未通过`,
          timeout: `${where}连接超时`,
          unreachable: `${where}网络不可达`,
          refused: `${where}端口没有在监听`,
          dns: `${where}找不到主机地址`,
          generic: `${where}没有连上`
        }
      : {
          auth: `${where}: user name or key was not accepted`,
          timeout: `${where}: connection timed out`,
          unreachable: `${where}: host is unreachable`,
          refused: `${where}: nothing is listening on that port`,
          dns: `${where}: host name could not be found`,
          generic: `${where} did not connect`
        }
    return { code: `JUMP_${kind.toUpperCase()}`, message: byKind[kind] ?? byKind.generic }
  }
  const aiHttp = parseAiHttpErrorMessage(clean)
  if (aiHttp) {
    return {
      code: `AI_HTTP_${aiHttp.status}`,
      message: friendlyAiHttpError(aiHttp.status, aiHttp.body, locale)
    }
  }
  if (/API Key 无效|API key is invalid|Rate limited|请求过于频繁|无法连接 AI 服务|Could not reach the AI provider/i.test(clean)) {
    return { code: 'AI_PROVIDER', message: clean }
  }
    if (/ECONNREFUSED/i.test(clean)) {
    const m = clean.match(/([\w.-]+):(\d+)/)
    const host = m?.[1] ?? ''
    const port = m?.[2] ?? ''
    return {
      code: 'ECONNREFUSED',
      message: zh
        ? `连接被拒绝：${host || '主机'}${port ? `:${port}` : ''} 没有在监听`
        : `Connection refused: nothing is listening on ${host || 'host'}${port ? `:${port}` : ''}`
    }
  }
  if (/ETIMEDOUT|Timed out while waiting for handshake|handshake timed out/i.test(clean)) {
    return {
      code: 'ETIMEDOUT',
      message: zh ? '连接超时，请检查网络或防火墙' : 'Connection timed out — check the network or firewall'
    }
  }
  if (/ENOTFOUND|getaddrinfo/i.test(clean)) {
    const m = clean.match(/ENOTFOUND\s+(\S+)/i) || clean.match(/getaddrinfo\s+\S+\s+(\S+)/i)
    const host = m?.[1] ?? ''
    return {
      code: 'ENOTFOUND',
      message: zh ? `找不到主机${host ? ` ${host}` : ''}` : `Host${host ? ` ${host}` : ''} not found`
    }
  }
  if (/All configured authentication methods failed/i.test(clean)) {
    return {
      code: 'AUTH',
      message: zh ? '认证失败：用户名、密码或密钥不正确' : 'Authentication failed: wrong user, password or key'
    }
  }
  if (/Permission denied|EACCES/i.test(clean)) {
    const m = clean.match(/(?:Permission denied|EACCES)[:\s]+(.+)/i)
    const path = (m?.[1] ?? '').trim()
    return {
      code: 'EACCES',
      message: zh ? `没有权限${path ? `：${path}` : ''}` : `Permission denied${path ? `: ${path}` : ''}`
    }
  }
  if (/No such file|ENOENT/i.test(clean)) {
    const m = clean.match(/(?:No such file or directory|ENOENT)[:\s]+(.+)/i)
    const path = (m?.[1] ?? '').trim()
    return {
      code: 'ENOENT',
      message: zh ? `文件或目录不存在${path ? `：${path}` : ''}` : `No such file or directory${path ? `: ${path}` : ''}`
    }
  }
  if (/Not connected|No session|session.*(closed|disconnected)/i.test(clean)) {
    return {
      code: 'DISCONNECTED',
      message: zh ? '会话已断开，请重新连接' : 'Session disconnected — reconnect'
    }
  }
  return null
}

function firstHumanLine(clean: string): string {
  return (
    clean
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !/^at\s+/.test(line)) ?? ''
  )
}

export function friendlyError(e: unknown, opts?: { locale?: Locale }): FriendlyError {
  const locale = opts?.locale ?? 'zh-CN'
  const raw = e instanceof Error ? e.message : String(e ?? '')
  const clean = firstHumanLine(stripIpcPrefix(raw))
  const mapped = mapKnown(clean, locale)
  if (mapped) {
    return { message: mapped.message, detail: clean !== mapped.message ? clean : undefined, code: mapped.code }
  }
  return { message: clean || (locale === 'zh-CN' ? '未知错误' : 'Unknown error'), detail: raw !== clean ? raw : undefined }
}

export function friendlyErrorMessage(e: unknown, locale: Locale = 'zh-CN'): string {
  return friendlyError(e, { locale }).message
}
