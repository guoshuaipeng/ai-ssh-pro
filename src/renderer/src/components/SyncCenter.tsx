import { useEffect, useState } from 'react'
import type { SavedSessionProfile, CommandSnippet } from '@shared/ipc'
import {
  DEFAULT_SCOPE,
  applyChoice,
  buildVault,
  findConflicts,
  loadSyncMeta,
  overwriteLocalAllowed,
  saveSyncMeta,
  statusGlyph,
  vaultHasSecrets,
  type SyncConflict,
  type SyncItem,
  type SyncMeta,
  type SyncScope
} from '@shared/sync-vault'
import { tg } from '../lib/i18n'
import { askConfirm, askText } from '../lib/dialogs'
import { showToast } from '../lib/toast'

type PublicCfg = {
  provider: 'gist' | 'webdav'
  gistId: string
  webdavUrl: string
  username: string
  hasToken: boolean
  hasPassword: boolean
  hasSyncPassphrase?: boolean
  hasVaultPass?: boolean
  scope: SyncScope
}

export function useSyncPhase(): SyncMeta {
  const [meta, setMeta] = useState<SyncMeta>(() => loadSyncMeta())
  useEffect(() => {
    const on = () => setMeta(loadSyncMeta())
    window.addEventListener('aiss-sync-meta', on)
    return () => window.removeEventListener('aiss-sync-meta', on)
  }, [])
  return meta
}

export function syncGlyph(): string {
  const meta = loadSyncMeta()
  if (!meta.enabled) return ''
  return statusGlyph(meta.phase)
}

function publish(meta: SyncMeta) {
  saveSyncMeta(meta)
  window.dispatchEvent(new Event('aiss-sync-meta'))
}

export function SyncSettings({
  profiles,
  snippets,
  onConflicts,
  onClose
}: {
  profiles: SavedSessionProfile[]
  snippets: CommandSnippet[]
  onConflicts: (rows: SyncConflict[]) => void
  onClose: () => void
}) {
  const [cfg, setCfg] = useState<PublicCfg | null>(null)
  const [scope, setScope] = useState<SyncScope>(DEFAULT_SCOPE)
  const [provider, setProvider] = useState<'gist' | 'webdav'>('gist')
  const [gistId, setGistId] = useState('')
  const [webdavUrl, setWebdavUrl] = useState('')
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState('')
  const [liveSnippets, setLiveSnippets] = useState(snippets)
  useEffect(() => {
    if (snippets.length) {
      setLiveSnippets(snippets)
      return
    }
    void window.aiss.snippets.list().then(setLiveSnippets).catch(() => undefined)
  }, [snippets])
  useEffect(() => {
    void window.aiss.sync.getConfig().then((raw) => {
      const c = raw as PublicCfg | null
      setCfg(c)
      if (!c) return
      setProvider(c.provider)
      setGistId(c.gistId)
      setWebdavUrl(c.webdavUrl)
      setUsername(c.username)
      setScope(c.scope)
    })
  }, [])
  const save = async (extra: Record<string, unknown> = {}) => {
    const next = (await window.aiss.sync.setConfig({ provider, gistId, webdavUrl, username, scope, ...extra })) as PublicCfg
    setCfg(next)
    publish({ ...(loadSyncMeta()), enabled: true, provider, phase: 'synced', remoteCount: 0 })
  }
  const setSecret = async (kind: 'token' | 'password' | 'passphrase') => {
    const value = await askText(tg(kind === 'passphrase' ? 'm2.vaultPass' : kind === 'token' ? 'm2.token' : 'm2.webdavPass'), '')
    if (!value) return
    await save(kind === 'passphrase' ? { syncPassphrase: value } : { [kind]: value })
  }
  const test = async () => {
    const r = await window.aiss.sync.test()
    setMessage(r.ok ? tg('m2.testOk', { detail: r.message }) : r.message)
  }
  const push = async () => {
    const items = buildVault({ profiles, snippets: liveSnippets, scope, settings: { locale: localStorage.getItem('aiss.locale') || '' } })
    if (!scope.credentials && vaultHasSecrets(items)) {
      setMessage(tg('m2.secretLeak'))
      return
    }
    publish({ ...loadSyncMeta(), enabled: true, provider, phase: 'syncing', remoteCount: items.length })
    const r = await window.aiss.sync.push({ items, scope }, '')
    if (!r.ok) {
      publish({ ...loadSyncMeta(), phase: 'error', lastError: r.message })
      setMessage(r.message || 'error')
      return
    }
    localStorage.setItem('aiss.sync.base.v1', JSON.stringify(Object.fromEntries(items.map((i) => [i.id, i.updatedAt]))))
    publish({ ...loadSyncMeta(), enabled: true, provider, phase: 'synced', lastOkAt: Date.now(), remoteCount: items.length, lastError: undefined })
    setMessage(tg('m2.pushed'))
  }
  const pull = async () => {
    publish({ ...loadSyncMeta(), enabled: true, phase: 'syncing', provider, remoteCount: loadSyncMeta().remoteCount })
    const r = await window.aiss.sync.pull('')
    if (!r.ok) {
      publish({ ...loadSyncMeta(), phase: 'error', lastError: r.message })
      setMessage(r.message || 'error')
      return
    }
    const remote = ((r.payload as { items?: SyncItem[] } | null)?.items ?? []) as SyncItem[]
    const local = buildVault({ profiles, snippets: liveSnippets, scope })
    let base: Record<string, number> = {}
    try {
      base = JSON.parse(localStorage.getItem('aiss.sync.base.v1') || '{}') as Record<string, number>
    } catch {
      base = {}
    }
    const conflicts = findConflicts(local, remote, base)
    if (conflicts.length) {
      sessionStorage.setItem('aiss.sync.conflicts', JSON.stringify(conflicts))
      publish({ ...loadSyncMeta(), phase: 'conflict', remoteCount: remote.length })
      onConflicts(conflicts)
      return
    }
    publish({ ...loadSyncMeta(), enabled: true, phase: 'synced', lastOkAt: Date.now(), remoteCount: remote.length })
    setMessage(tg('m2.pulled'))
  }
  return (
    <div className="workspace-panel" data-testid="sync-settings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('m2.cloudSync')}</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={() => void test()}>{tg('m2.test')}</button>
          <button type="button" onClick={() => void pull()}>{tg('m2.pull')}</button>
          <button type="button" className="primary" onClick={() => void push()}>{tg('m2.push')}</button>
          <button type="button" onClick={onClose}>{tg('common.close')}</button>
        </div>
      </div>
      <div className="workspace-panel-body m2-form">
        <div className="l2-filters">
          <label className="l4-check"><input type="radio" checked={provider === 'gist'} onChange={() => setProvider('gist')} />Gist</label>
          <label className="l4-check"><input type="radio" checked={provider === 'webdav'} onChange={() => setProvider('webdav')} />WebDAV</label>
        </div>
        {provider === 'gist' ? (
          <input value={gistId} placeholder="gist id" onChange={(e) => setGistId(e.target.value)} onBlur={() => void save()} />
        ) : (
          <>
            <input value={webdavUrl} placeholder="https://dav.example/remote.php/dav/files/me" onChange={(e) => setWebdavUrl(e.target.value)} onBlur={() => void save()} />
            <input value={username} placeholder={tg('ui.45')} onChange={(e) => setUsername(e.target.value)} onBlur={() => void save()} />
          </>
        )}
        <div className="workspace-panel-actions">
          <button type="button" onClick={() => void setSecret(provider === 'gist' ? 'token' : 'password')}>{provider === 'gist' ? tg('m2.token') : tg('m2.webdavPass')}</button>
          <button type="button" onClick={() => void setSecret('passphrase')}>{tg('m2.vaultPass')}</button>
          <span className="l7-meta">{cfg?.hasSyncPassphrase || cfg?.hasVaultPass ? tg('m2.keyLocal') : tg('m2.needKey')}</span>
        </div>
        {(Object.keys(DEFAULT_SCOPE) as Array<keyof SyncScope>).map((key) => (
          <label key={key} className="l4-check">
            <input
              type="checkbox"
              checked={scope[key]}
              onChange={(e) => {
                const next = { ...scope, [key]: e.target.checked }
                setScope(next)
                void save({ scope: next })
              }}
            />
            {tg(`m2.scope.${key}`)}
          </label>
        ))}
        <p className="l4-hint">{tg('m2.credHint')}</p>
        {message ? <p>{message}</p> : null}
      </div>
    </div>
  )
}

export function SyncConflicts({
  onClose
}: {
  onClose: () => void
}) {
  const [rows, setRows] = useState<SyncConflict[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('aiss.sync.conflicts') || '[]') as SyncConflict[]
    } catch {
      return []
    }
  })
  const choose = async (row: SyncConflict, side: 'local' | 'cloud' | 'both') => {
    if (side === 'cloud') {
      const backed = await window.aiss.sync.backupLocal({ conflict: row.id, at: Date.now() })
      let skip = false
      if (!backed.ok) {
        const once = await askConfirm(tg('m2.backupRequired'), tg('m2.backupSkip'), { id: 'confirm.syncOverwrite', danger: true, okLabel: tg('confirm.overwriteLocal') })
        const twice = once && (await askConfirm(tg('m2.backupRequired'), tg('m2.backupSkip2'), { id: 'confirm.syncOverwrite', danger: true, okLabel: tg('confirm.overwriteLocal') }))
        skip = Boolean(twice)
      }
      const gate = overwriteLocalAllowed({ backupCompleted: Boolean(backed.ok && backed.file), skipConfirmed: skip })
      if (!gate.ok) {
        showToast(tg('m2.backupRequired'))
        return
      }
    }
    const kept = applyChoice(row, side)
    const next = rows.filter((r) => r.id !== row.id)
    setRows(next)
    sessionStorage.setItem('aiss.sync.conflicts', JSON.stringify(next))
    sessionStorage.setItem(`aiss.sync.choice.${row.id}`, JSON.stringify(kept))
    if (!next.length) {
      publish({ ...loadSyncMeta(), phase: 'synced', lastOkAt: Date.now() })
    }
  }
  return (
    <div className="workspace-panel" data-testid="sync-conflicts">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('m2.conflicts')}</h2>
        <button type="button" onClick={onClose}>{tg('common.close')}</button>
      </div>
      <div className="workspace-panel-body">
        {rows.length === 0 ? <p>{tg('m2.noConflicts')}</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="m2-row">
            <div>
              <strong>{row.name}</strong>
              <div className="l7-meta">{row.reason}</div>
            </div>
            <div className="workspace-panel-actions">
              <button type="button" onClick={() => void choose(row, 'local')}>{tg('m2.keepLocal')}</button>
              <button type="button" onClick={() => void choose(row, 'cloud')}>{tg('m2.keepCloud')}</button>
              <button type="button" onClick={() => void choose(row, 'both')}>{tg('m2.keepBoth')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
