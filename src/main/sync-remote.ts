/** Gist and WebDAV transport for the encrypted vault. Tokens stay in headers and out of error text. */
import { redactSecrets } from '../shared/sync-vault'

export type RemoteResult<T> = { ok: true; value: T } | { ok: false; message: string }

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }>

const UA = 'ai-ssh-pro'

function fail(status: number, body: string, secrets: string[]): RemoteResult<never> {
  const clipped = body.replace(/\s+/g, ' ').slice(0, 180)
  return { ok: false, message: redactSecrets(`HTTP ${status} ${clipped}`.trim(), secrets) }
}

export async function testGithubToken(token: string, fetchImpl: FetchLike = fetch): Promise<RemoteResult<{ login: string }>> {
  try {
    const res = await fetchImpl('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA }
    })
    if (!res.ok) return fail(res.status, await res.text(), [token])
    const json = (await res.json()) as { login?: string }
    return { ok: true, value: { login: json.login || 'github' } }
  } catch (e) {
    return { ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e), [token]) }
  }
}

export async function gistRead(token: string, gistId: string, fetchImpl: FetchLike = fetch): Promise<RemoteResult<string>> {
  try {
    const res = await fetchImpl(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA }
    })
    if (!res.ok) return fail(res.status, await res.text(), [token])
    const json = (await res.json()) as { files?: Record<string, { content?: string }> }
    const file = json.files?.['ai-ssh-pro-vault.json']
    if (!file?.content) return { ok: false, message: 'vault-missing' }
    return { ok: true, value: file.content }
  } catch (e) {
    return { ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e), [token]) }
  }
}

export async function gistWrite(token: string, gistId: string | undefined, content: string, fetchImpl: FetchLike = fetch): Promise<RemoteResult<{ id: string }>> {
  const body = JSON.stringify({
    description: 'AI-SSH-Pro encrypted vault',
    public: false,
    files: { 'ai-ssh-pro-vault.json': { content } }
  })
  const url = gistId ? `https://api.github.com/gists/${encodeURIComponent(gistId)}` : 'https://api.github.com/gists'
  try {
    const res = await fetchImpl(url, {
      method: gistId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA, 'Content-Type': 'application/json' },
      body
    })
    if (!res.ok) return fail(res.status, await res.text(), [token])
    const json = (await res.json()) as { id?: string }
    if (!json.id) return { ok: false, message: 'gist-no-id' }
    return { ok: true, value: { id: json.id } }
  } catch (e) {
    return { ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e), [token]) }
  }
}

export function basicHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
}

export function webdavFileUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, '')
  return `${trimmed}/ai-ssh-pro-vault.json`
}

export async function testWebdav(url: string, user: string, pass: string, fetchImpl: FetchLike = fetch): Promise<RemoteResult<{ url: string }>> {
  const secrets = [user, pass]
  try {
    const res = await fetchImpl(url, { method: 'PROPFIND', headers: { Authorization: basicHeader(user, pass), Depth: '0', 'User-Agent': UA } })
    if (res.status === 401 || res.status === 403) return fail(res.status, 'auth', secrets)
    if (!res.ok && res.status !== 207 && res.status !== 404) return fail(res.status, await res.text(), secrets)
    return { ok: true, value: { url } }
  } catch (e) {
    return { ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e), secrets) }
  }
}

export async function webdavRead(url: string, user: string, pass: string, fetchImpl: FetchLike = fetch): Promise<RemoteResult<string>> {
  const secrets = [user, pass]
  try {
    const res = await fetchImpl(webdavFileUrl(url), { headers: { Authorization: basicHeader(user, pass), 'User-Agent': UA } })
    if (res.status === 404) return { ok: true, value: '' }
    if (!res.ok) return fail(res.status, await res.text(), secrets)
    return { ok: true, value: await res.text() }
  } catch (e) {
    return { ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e), secrets) }
  }
}

export async function webdavWrite(url: string, user: string, pass: string, content: string, fetchImpl: FetchLike = fetch): Promise<RemoteResult<{ url: string }>> {
  const secrets = [user, pass]
  try {
    const res = await fetchImpl(webdavFileUrl(url), {
      method: 'PUT',
      headers: { Authorization: basicHeader(user, pass), 'Content-Type': 'application/json', 'User-Agent': UA },
      body: content
    })
    if (!res.ok && res.status !== 201 && res.status !== 204) return fail(res.status, await res.text(), secrets)
    return { ok: true, value: { url: webdavFileUrl(url) } }
  } catch (e) {
    return { ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e), secrets) }
  }
}
