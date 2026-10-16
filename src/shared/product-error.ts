/** PF-5: classify a failure so the UI can speak and offer a next step. */

export type NoticeKind = 'unreachable' | 'auth' | 'dropped' | 'permission' | 'import' | 'generic'

export function noticeKind(raw: string): NoticeKind {
  const s = String(raw ?? '')
  if (/authentication methods failed|认证失败|密码或密钥|用户名或密钥/i.test(s)) return 'auth'
  if (/Permission denied|EACCES|没有权限/i.test(s)) return 'permission'
  if (/无法解析|import fail|parse error|not a valid/i.test(s)) return 'import'
  if (/disconnected|Not connected|会话已断开|连接已断开|connection closed/i.test(s)) return 'dropped'
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|无法连接|连接超时|找不到主机|Connection refused|timed out|not found|handshake/i.test(s)) {
    return 'unreachable'
  }
  return 'generic'
}

/** Host token pulled from a typical ssh error, if one is present. */
export function noticeHost(raw: string): string {
  const m = String(raw ?? '').match(/([A-Za-z0-9._-]+):(\d{2,5})/)
  return m?.[1] ?? ''
}

/** List skeletons stay hidden until the wait is long enough to be worth a flash. */
export function shouldShowSkeleton(elapsedMs: number, thresholdMs = 300): boolean {
  return elapsedMs >= thresholdMs
}

const LEAK = /Error invoking remote method|^\s*Error:\s|\bECONNREFUSED\b|\bEACCES\b|\bENOENT\b/i

/** The sentence a person reads must not be a stack or an IPC channel name. Pair with friendlyError. */
export function isEngineerLeak(message: string): boolean {
  return LEAK.test(message)
}
