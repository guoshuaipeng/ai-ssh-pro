import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import EmptyState from './EmptyState'
import { tg, type MessageKey } from '../lib/i18n'
import Button from './ui/Button'

const ACTION_LABEL: Record<'add' | 'update' | 'unchanged', MessageKey> = {
  add: 'kh.action.add',
  update: 'kh.action.update',
  unchanged: 'kh.action.unchanged'
}

type HostRow = {
  hostPort: string
  fingerprint: string
  hostKeyBase64: string
  trustedAt: number
}

type PreviewRow = {
  host: string
  port: number
  hostPort: string
  keyType: string
  hostKeyBase64: string
  action: 'add' | 'update' | 'unchanged'
  fingerprint: string
  selectedDefault: boolean
  previousFingerprint?: string
}

type Preview = {
  rows: PreviewRow[]
  skippedHashed: number
  skippedOther: number
  skippedHashedSamples?: string[]
  sourcePath?: string
}

type LocalKey = { name: string; path: string }

type Props = {
  open: boolean
  onClose: () => void
  /** Fill connection editor privateKeyPath + key auth; never reads key bytes. */
  onUseKey?: (path: string) => void
}

function rowId(row: Pick<PreviewRow, 'hostPort' | 'hostKeyBase64'>): string {
  return `${row.hostPort}|${row.hostKeyBase64}`
}

function formatTrustedAt(ms: number, en: boolean): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString(en ? 'en' : 'zh-CN')
  } catch {
    return '—'
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Trusted host keys + OpenSSH known_hosts import (preview before write) + ~/.ssh keys. */
export default function KnownHostsModal({ open, onClose, onUseKey }: Props) {
  const [tab, setTab] = useState<'hosts' | 'keys'>('hosts')
  const [hosts, setHosts] = useState<HostRow[]>([])
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [localKeys, setLocalKeys] = useState<LocalKey[]>([])
  const [sshDir, setSshDir] = useState('')
  const [keysError, setKeysError] = useState<string | null>(null)
  const [lookupHost, setLookupHost] = useState('')
  const [lookupPort, setLookupPort] = useState('22')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupHint, setLookupHint] = useState<string | null>(null)

  const loadHosts = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await window.aiss.knownHosts.list()
      setHosts(rows)
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadKeys = useCallback(async () => {
    try {
      const res = await window.aiss.knownHosts.listLocalKeys()
      setSshDir(res.dir)
      setLocalKeys(res.keys)
      setKeysError(res.error ?? null)
    } catch (e) {
      setKeysError(e instanceof Error ? e.message : String(e))
      setLocalKeys([])
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setHint(null)
    setLookupHint(null)
    setLookupHost('')
    setTab('hosts')
    void loadHosts()
    void loadKeys()
  }, [open, loadHosts, loadKeys])

  const counts = useMemo(() => {
    if (!preview) return null
    return {
      add: preview.rows.filter((r) => r.action === 'add').length,
      update: preview.rows.filter((r) => r.action === 'update').length,
      unchanged: preview.rows.filter((r) => r.action === 'unchanged').length,
      selected: selected.size
    }
  }, [preview, selected])

  const startImport = async () => {
    setBusy(true)
    setHint(null)
    try {
      const next = await window.aiss.knownHosts.pickImport()
      if (!next) return
      setPreview(next)
      setSelected(new Set(next.rows.filter((r) => r.selectedDefault).map(rowId)))
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const applyImport = async () => {
    if (!preview) return
    const rows = preview.rows.filter((r) => selected.has(rowId(r))).map((r) => ({
      host: r.host,
      port: r.port,
      hostKeyBase64: r.hostKeyBase64
    }))
    if (!rows.length) {
      setHint(tg('kh.noneSelected'))
      return
    }
    setBusy(true)
    try {
      const res = await window.aiss.knownHosts.applyImport(rows)
      setHint(tg('kh.imported', { ok: res.ok, fail: res.fail }))
      setPreview(null)
      setSelected(new Set())
      await loadHosts()
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const removeHost = async (hostPort: string) => {
    setBusy(true)
    try {
      await window.aiss.knownHosts.remove(hostPort)
      await loadHosts()
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runLookup = async () => {
    const host = lookupHost.trim()
    if (!host) {
      setLookupHint(tg('kh.lookupNeedHost'))
      return
    }
    setLookupBusy(true)
    setLookupHint(null)
    try {
      const port = Math.min(65535, Math.max(1, parseInt(lookupPort, 10) || 22))
      const res = await window.aiss.knownHosts.lookupHost(host, port)
      if (res.missingTool) {
        setLookupHint(tg('kh.lookupNoTool'))
        return
      }
      if (!res.ok) {
        setLookupHint(res.error || tg('kh.lookupFail'))
        return
      }
      if (!res.matches.length) {
        setLookupHint(tg('kh.lookupEmpty', { host: res.query, file: res.file }))
        return
      }
      // Offer matches as an import preview (single-host only).
      const existing = new Map(hosts.map((h) => [h.hostPort, h]))
      const rows: PreviewRow[] = res.matches.map((m) => {
        const hostPort = `${m.host}:${m.port}`
        const cur = existing.get(hostPort)
        let action: PreviewRow['action'] = 'add'
        let previousFingerprint: string | undefined
        if (cur) {
          action = cur.hostKeyBase64 === m.hostKeyBase64 ? 'unchanged' : 'update'
          if (action === 'update') previousFingerprint = cur.fingerprint
        }
        return {
          host: m.host,
          port: m.port,
          hostPort,
          keyType: m.keyType,
          hostKeyBase64: m.hostKeyBase64,
          action,
          fingerprint: m.fingerprint,
          selectedDefault: action !== 'unchanged',
          previousFingerprint
        }
      })
      setPreview({
        rows,
        skippedHashed: 0,
        skippedOther: 0,
        skippedHashedSamples: [],
        sourcePath: `${res.file} · ssh-keygen -F ${res.query}`
      })
      setSelected(new Set(rows.filter((r) => r.selectedDefault).map((r) => rowId(r))))
      const hashedN = res.matches.filter((m) => m.hashed).length
      setLookupHint(
        tg('kh.lookupOk', { n: res.matches.length, hashed: hashedN, query: res.query })
      )
    } catch (e) {
      setLookupHint(e instanceof Error ? e.message : String(e))
    } finally {
      setLookupBusy(false)
    }
  }

  const selectWritable = () => {
    if (!preview) return
    setSelected(new Set(preview.rows.filter((r) => r.action !== 'unchanged').map(rowId)))
  }

  return (
    <Modal
      open={open}
      title={tg('kh.title')}
      onClose={onClose}
      width={720}
      testId="known-hosts-modal"
      footer={
        <div className="kh-footer">
          {hint ? <p className="kh-hint" data-testid="kh-mgmt-hint">{hint}</p> : <span />}
          <div className="kh-footer-actions">
            {preview ? (
              <>
                <button type="button" disabled={busy} onClick={() => setPreview(null)}>
                  {tg('kh.cancelPreview')}
                </button>
                <Button variant="primary" disabled={busy || selected.size === 0} data-testid="kh-apply-import" onClick={() => void applyImport()}>
                  {tg('kh.applyImport', { n: selected.size })}
                </Button>
              </>
            ) : (
              <button type="button" onClick={onClose}>
                {tg('ui.27')}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="kh-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'hosts'} className={tab === 'hosts' ? 'is-on' : ''} data-testid="kh-tab-hosts" onClick={() => setTab('hosts')}>
          {tg('kh.tabHosts')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'keys'} className={tab === 'keys' ? 'is-on' : ''} data-testid="kh-tab-keys" onClick={() => setTab('keys')}>
          {tg('kh.tabKeys')}
        </button>
      </div>

      {tab === 'hosts' ? (
        <div className="kh-panel" data-testid="kh-hosts-panel">
          <div className="kh-toolbar">
            <p className="kh-lead">{tg('kh.lead')}</p>
            <Button variant="primary" data-testid="kh-import" disabled={busy} onClick={() => void startImport()}>
              {tg('kh.import')}
            </Button>
          </div>
          <div className="kh-lookup" data-testid="kh-lookup">
            <p className="kh-muted" style={{ margin: '0 0 6px' }}>{tg('kh.lookupLead')}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                data-testid="kh-lookup-host"
                value={lookupHost}
                onChange={(e) => setLookupHost(e.target.value)}
                placeholder={tg('kh.lookupHostPh')}
                aria-label={tg('kh.lookupHostPh')}
                style={{ flex: '1 1 160px', minWidth: 120 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void runLookup()
                  }
                }}
              />
              <input
                data-testid="kh-lookup-port"
                value={lookupPort}
                onChange={(e) => setLookupPort(e.target.value)}
                placeholder="22"
                aria-label="port"
                style={{ width: 64 }}
              />
              <Button data-testid="kh-lookup-run" disabled={lookupBusy || busy} onClick={() => void runLookup()}>
                {lookupBusy ? tg('kh.lookupBusy') : tg('kh.lookupRun')}
              </Button>
            </div>
            {lookupHint ? <p className="kh-muted" style={{ margin: '6px 0 0' }} data-testid="kh-lookup-hint">{lookupHint}</p> : null}
          </div>

          {preview ? (
            <div className="kh-preview" data-testid="kh-import-preview">
              <div className="kh-preview-head">
                <strong>{tg('kh.previewTitle')}</strong>
                {preview.sourcePath ? <span className="kh-path" title={preview.sourcePath}>{preview.sourcePath}</span> : null}
              </div>
              <p className="kh-preview-summary">
                {tg('kh.previewSummary', {
                  add: counts?.add ?? 0,
                  update: counts?.update ?? 0,
                  unchanged: counts?.unchanged ?? 0,
                  hashed: preview.skippedHashed,
                  other: preview.skippedOther
                })}
              </p>
              {preview.skippedHashed > 0 ? (
                <div className="kh-hashed" data-testid="kh-hashed-skip">
                  <strong>{tg('kh.hashedTitle', { n: preview.skippedHashed })}</strong>
                  <p>{tg('kh.hashedBody')}</p>
                  {(preview.skippedHashedSamples ?? []).length ? (
                    <ul className="kh-hashed-list">
                      {(preview.skippedHashedSamples ?? []).map((line, i) => (
                        <li key={i}><code>{line}</code></li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <div className="kh-preview-actions">
                <button type="button" onClick={selectWritable}>{tg('kh.selectChanges')}</button>
                <button type="button" onClick={() => setSelected(new Set())}>{tg('kh.selectNone')}</button>
              </div>
              <div className="kh-table-wrap">
                <table className="kh-table">
                  <thead>
                    <tr>
                      <th>{tg('kh.colPick')}</th>
                      <th>{tg('kh.colHost')}</th>
                      <th>{tg('kh.colAction')}</th>
                      <th>{tg('kh.colFp')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const id = rowId(row)
                      return (
                        <tr key={id} data-action={row.action}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(id)}
                              disabled={row.action === 'unchanged'}
                              onChange={() => toggle(id)}
                              aria-label={row.hostPort}
                            />
                          </td>
                          <td>
                            <code>{row.hostPort}</code>
                            <div className="kh-muted">{row.keyType}</div>
                          </td>
                          <td>{tg(ACTION_LABEL[row.action])}</td>
                          <td>
                            <code className="kh-fp" title={row.fingerprint}>{row.fingerprint}</code>
                            {row.previousFingerprint ? (
                              <div className="kh-muted" title={row.previousFingerprint}>
                                {tg('kh.was')}: {row.previousFingerprint}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="kh-safe">{tg('kh.previewSafe')}</p>
            </div>
          ) : loading ? (
            <p className="kh-muted">{tg('kh.loading')}</p>
          ) : hosts.length === 0 ? (
            <EmptyState
              compact
              testId="kh-empty"
              icon="host"
              title={tg('kh.emptyTitle')}
              desc={tg('kh.emptyDesc')}
            />
          ) : (
            <div className="kh-table-wrap">
              <table className="kh-table" data-testid="kh-host-table">
                <thead>
                  <tr>
                    <th>{tg('kh.colHost')}</th>
                    <th>{tg('kh.colFp')}</th>
                    <th>{tg('kh.colTrusted')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {hosts.map((row) => (
                    <tr key={row.hostPort}>
                      <td><code>{row.hostPort}</code></td>
                      <td><code className="kh-fp" title={row.fingerprint}>{row.fingerprint}</code></td>
                      <td className="kh-muted">{formatTrustedAt(row.trustedAt, false)}</td>
                      <td className="kh-row-actions">
                        <button
                          type="button"
                          data-testid="kh-copy-fp"
                          onClick={() => {
                            void copyText(row.fingerprint).then((ok) => {
                              setHint(ok ? tg('kh.copiedFp') : tg('kh.copyFail'))
                            })
                          }}
                        >
                          {tg('kh.copyFp')}
                        </button>
                        <button type="button" data-testid="kh-remove" disabled={busy} onClick={() => void removeHost(row.hostPort)}>
                          {tg('kh.remove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="kh-panel" data-testid="kh-keys-panel">
          <div className="kh-toolbar">
            <p className="kh-lead">{tg('kh.keysLead', { dir: sshDir || '~/.ssh' })}</p>
            <button type="button" data-testid="kh-open-ssh-dir" onClick={() => void window.aiss.knownHosts.openSshDir()}>
              {tg('kh.openFolder')}
            </button>
          </div>
          {keysError ? <p className="kh-hint">{keysError}</p> : null}
          {localKeys.length === 0 ? (
            <EmptyState
              compact
              testId="kh-keys-empty"
              icon="host"
              title={tg('kh.keysEmptyTitle')}
              desc={tg('kh.keysEmptyDesc')}
              primary={{ label: tg('kh.openFolder'), onClick: () => void window.aiss.knownHosts.openSshDir(), testId: 'kh-keys-open' }}
            />
          ) : (
            <ul className="kh-key-list" data-testid="kh-key-list">
              {localKeys.map((k) => (
                <li key={k.path}>
                  <div className="kh-key-main">
                    <code title={k.path}>{k.name}</code>
                    <span className="kh-muted">{k.path}</span>
                  </div>
                  {onUseKey ? (
                    <Button variant="primary"
                      data-testid="kh-use-key"
                      onClick={() => onUseKey(k.path)}
                    >
                      {tg('kh.useKey')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="kh-safe">{tg('kh.keysHint')}</p>
        </div>
      )}
    </Modal>
  )
}
