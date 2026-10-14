import { useCallback, useEffect, useMemo, useState } from 'react'
import { tg } from '../lib/i18n'
import { askConfirm, askText, confirmDialog } from '../lib/dialogs'
import type { SftpListEntry, SftpListResult, SftpProgressEvent } from '@shared/ipc'
import { isLikelyTextFile } from './RemoteTextEditor'
import EmptyState from './EmptyState'

type Props = {
  sessionId: string | null
  sessionTitle?: string
  onClose: () => void
  /** 打开远端文本预览/编辑 */
  onOpenRemoteFile?: (info: { remotePath: string; name: string; size: number }) => void
}

type TransferRow = {
  id: string
  name: string
  direction: 'upload' | 'download'
  transferred: number
  total: number
  status: 'running' | 'done' | 'error'
  error?: string
}

type SftpApi = {
  list: (sessionId: string, remotePath: string) => Promise<SftpListResult>
  home: (sessionId: string) => Promise<string>
  download: (sessionId: string, remotePath: string, localPath: string, transferId?: string) => Promise<void>
  upload: (sessionId: string, localPath: string, remotePath: string, transferId?: string) => Promise<void>
  mkdir: (sessionId: string, remotePath: string) => Promise<void>
  remove: (sessionId: string, remotePath: string) => Promise<void>
  rename: (sessionId: string, fromPath: string, toPath: string) => Promise<void>
  pickDownloadPath: (defaultName?: string) => Promise<string | null>
  pickUploadFiles: () => Promise<string[] | null>
  pickSavePaths?: (names: string[]) => Promise<string[] | null>
  readText?: (sessionId: string, remotePath: string, maxBytes?: number) => Promise<unknown>
  writeText?: (sessionId: string, remotePath: string, content: string) => Promise<boolean>
  onProgress?: (cb: (payload: SftpProgressEvent) => void) => () => void
}

function getSftpApi(): SftpApi | null {
  const aiss = (window as unknown as { aiss?: { sftp?: SftpApi } }).aiss
  return aiss?.sftp ?? null
}

function parentPath(path: string): string {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/') return '/'
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  return p.slice(0, idx) || '/'
}

function formatSize(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatTime(ms?: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

function pct(transferred: number, total: number): number {
  if (!total || total <= 0) return transferred > 0 ? 99 : 0
  return Math.min(100, Math.round((transferred / total) * 100))
}

export default function SftpPanel({ sessionId, sessionTitle, onClose, onOpenRemoteFile }: Props) {
  const [cwd, setCwd] = useState('/')
  const [pathInput, setPathInput] = useState('/')
  const [entries, setEntries] = useState<SftpListEntry[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [hint, setHint] = useState<string | null>(null)

  const selectedEntries = useMemo(
    () => entries.filter((e) => selected[e.path]),
    [entries, selected]
  )

  const refresh = useCallback(
    async (path: string) => {
      if (!sessionId) {
        setError(tg('sftp.noSession'))
        return
      }
      const api = getSftpApi()
      if (!api) {
        setError(tg('sftp.notReadyRestart'))
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await api.list(sessionId, path)
        setCwd(res.path)
        setPathInput(res.path)
        setEntries(res.entries)
        setSelected({})
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [sessionId]
  )

  const goHome = useCallback(async () => {
    if (!sessionId) return
    const api = getSftpApi()
    if (!api?.home) {
      await refresh('/')
      return
    }
    try {
      const home = await api.home(sessionId)
      await refresh(home)
    } catch {
      await refresh('/')
    }
  }, [refresh, sessionId])

  useEffect(() => {
    setEntries([])
    setError(null)
    setTransfers([])
    if (sessionId) void goHome()
  }, [sessionId, goHome])

  useEffect(() => {
    const api = getSftpApi()
    if (!api?.onProgress) return
    return api.onProgress((p) => {
      setTransfers((prev) => {
        const i = prev.findIndex((t) => t.id === p.transferId)
        const row: TransferRow = {
          id: p.transferId,
          name: p.name,
          direction: p.direction,
          transferred: p.transferred,
          total: p.total,
          status: p.error ? 'error' : p.done ? 'done' : 'running',
          error: p.error
        }
        if (i < 0) return [row, ...prev].slice(0, 12)
        const next = [...prev]
        next[i] = row
        return next
      })
    })
  }, [])

  const runBusy = async (fn: () => Promise<void>, skipRefresh = false) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (!skipRefresh) await refresh(cwd)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openEntry = (entry: SftpListEntry) => {
    if (entry.isDirectory) {
      void refresh(entry.path)
      return
    }
    if (onOpenRemoteFile && isLikelyTextFile(entry.name)) {
      onOpenRemoteFile({ remotePath: entry.path, name: entry.name, size: entry.size })
      return
    }
    if (onOpenRemoteFile) {
      void confirmDialog({ title: tg('dlg.confirmTitle'), body: tg('sftp.notText', { name: entry.name }), confirmText: tg('dlg.openAnyway') }).then((ok) => {
        if (ok) onOpenRemoteFile({ remotePath: entry.path, name: entry.name, size: entry.size })
      })
    }
  }

  const goUp = () => {
    if (cwd === '/') return
    void refresh(parentPath(cwd))
  }

  const submitPath = () => {
    const next = pathInput.trim() || '/'
    void refresh(next.startsWith('/') ? next : `/${next}`)
  }

  const uploadLocals = async (files: string[]) => {
    if (!sessionId || !files.length) return
    await runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error(tg('sftp.notReady'))
      for (const localPath of files) {
        const name = localPath.replace(/\\/g, '/').split('/').pop() || 'upload.bin'
        const remote = cwd === '/' ? `/${name}` : `${cwd.replace(/\/+$/, '')}/${name}`
        const transferId = `ul-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        await api.upload(sessionId, localPath, remote, transferId)
      }
      setHint(tg('sftp.uploaded', { n: files.length }))
    })
  }

  const onUpload = () => {
    if (!sessionId) return
    void (async () => {
      const api = getSftpApi()
      if (!api) return
      const files = await api.pickUploadFiles()
      if (!files?.length) return
      await uploadLocals(files)
    })()
  }

  const onDownloadOne = (entry: SftpListEntry) => {
    if (!sessionId || entry.isDirectory) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error(tg('sftp.notReady'))
      const local = await api.pickDownloadPath(entry.name)
      if (!local) return
      const transferId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      await api.download(sessionId, entry.path, local, transferId)
      setHint(tg('sftp.downloadedOne', { name: entry.name }))
    }, true)
  }

  const onDownloadSelected = () => {
    const files = selectedEntries.filter((e) => !e.isDirectory)
    if (!sessionId || files.length === 0) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error(tg('sftp.notReady'))
      if (files.length === 1) {
        const local = await api.pickDownloadPath(files[0]!.name)
        if (!local) return
        const transferId = `dl-${Date.now()}`
        await api.download(sessionId, files[0]!.path, local, transferId)
        setHint(tg('sftp.downloadedOne', { name: files[0]!.name }))
        return
      }
      if (!api.pickSavePaths) throw new Error(tg('sftp.needUpdate'))
      const locals = await api.pickSavePaths(files.map((f) => f.name))
      if (!locals?.length) return
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!
        const local = locals[i]
        if (!local) continue
        const transferId = `dl-${Date.now()}-${i}`
        await api.download(sessionId, f.path, local, transferId)
      }
      setHint(tg('sftp.downloaded', { n: files.length }))
    }, true)
  }

  const onMkdir = async () => {
    if (!sessionId) return
    const name = await askText(tg('sftp.newDirName'))
    if (!name?.trim()) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error(tg('sftp.notReady'))
      const remote = cwd === '/' ? `/${name.trim()}` : `${cwd.replace(/\/+$/, '')}/${name.trim()}`
      await api.mkdir(sessionId, remote)
    })
  }

  const onRemove = async (entry: SftpListEntry) => {
    if (!sessionId) return
    if (!(await confirmDialog({ title: tg('dlg.confirmTitle'), body: tg('sftp.confirmDelete', { name: entry.name }), danger: true, confirmText: tg('dlg.delete') }))) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error(tg('sftp.notReady'))
      await api.remove(sessionId, entry.path)
    })
  }

  const onRename = async (entry: SftpListEntry) => {
    if (!sessionId) return
    const next = await askText(tg('sftp.newName'), entry.name)
    if (!next?.trim() || next.trim() === entry.name) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error(tg('sftp.notReady'))
      const to = cwd === '/' ? `/${next.trim()}` : `${cwd.replace(/\/+$/, '')}/${next.trim()}`
      await api.rename(sessionId, entry.path, to)
    })
  }

  const toggleSelect = (path: string) => {
    setSelected((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  const onDropFiles = (ev: React.DragEvent) => {
    ev.preventDefault()
    setDragOver(false)
    if (!sessionId || busy) return
    const list = Array.from(ev.dataTransfer.files || [])
    const paths = list
      .map((f) => window.aiss.fs.pathForFile?.(f) || (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p))
    if (!paths.length) {
      setError(tg('sftp.dropNeedPath'))
      return
    }
    void uploadLocals(paths)
  }

  return (
    <div className="workspace-panel workspace-panel--sftp">
      <div className="workspace-panel-toolbar sftp-toolbar">
        <h2 className="workspace-panel-title">
          {tg('sftp.title')}{sessionTitle ? ` · ${sessionTitle}` : ''}
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" disabled={!sessionId || busy} onClick={() => void goHome()}>
            {tg('sftp.home')}
          </button>
          <button type="button" disabled={!sessionId || busy} onClick={() => void refresh(cwd)}>
            {tg('sftp.refresh')}
          </button>
          <button type="button" disabled={!sessionId || busy} onClick={onMkdir}>
            {tg('sftp.mkdir')}
          </button>
          <button
            type="button"
            disabled={!sessionId || busy || selectedEntries.every((e) => e.isDirectory)}
            onClick={onDownloadSelected}
          >
            {tg('sftp.downloadSel')}
          </button>
          <button type="button" className="primary" disabled={!sessionId || busy} onClick={onUpload}>
            {tg('sftp.upload')}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            {tg('common.close')}
          </button>
        </div>
      </div>

      <div className="workspace-panel-body workspace-panel-body--sftp">
        {!sessionId ? (
          <p className="sftp-empty">{tg('sftp.needSession')}</p>
        ) : (
          <>
            <div className="sftp-pathbar">
              <button type="button" disabled={cwd === '/' || loading || busy} onClick={goUp}>
                {tg('sftp.up')}
              </button>
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitPath()
                }}
                aria-label={tg('sftp.remotePath')}
                spellCheck={false}
              />
              <button type="button" disabled={busy || loading} onClick={submitPath}>
                {tg('sftp.go')}
              </button>
            </div>

            <p className="sftp-hint">
              {tg('sftp.hintA')} <code>sz</code> / <code>rz</code>{' '}
              {tg('sftp.hintB')}
            </p>

            {error ? <div className="sftp-error">{error}</div> : null}
            {hint ? <div className="sftp-ok">{hint}</div> : null}

            <div
              className={`sftp-browser${dragOver ? ' is-dragover' : ''}`}
              onDragEnter={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDropFiles}
            >
              {loading ? (
                <div className="sftp-empty">{tg('common.loading')}</div>
              ) : entries.length === 0 ? (
                <div className="sftp-empty">
                  <EmptyState compact testId="sftp-empty" icon="📂" title={tg('ux08.sftpTitle')} desc={tg('ux08.sftpDesc')} />
                </div>
              ) : (
                <table className="sftp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th>{tg('sftp.colName')}</th>
                      <th style={{ width: 100 }}>{tg('sftp.colSize')}</th>
                      <th style={{ width: 160 }}>{tg('sftp.colTime')}</th>
                      <th style={{ width: 220 }}>{tg('sftp.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr
                        key={e.path}
                        className={selected[e.path] ? 'is-selected' : ''}
                        onDoubleClick={() => openEntry(e)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(selected[e.path])}
                            onChange={() => toggleSelect(e.path)}
                            disabled={busy}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`sftp-name-btn${e.isDirectory ? ' is-dir' : ''}${!e.isDirectory && isLikelyTextFile(e.name) ? ' is-text' : ''}`}
                            onClick={() => openEntry(e)}
                            disabled={busy}
                          >
                            {e.isDirectory ? '📁 ' : isLikelyTextFile(e.name) ? '📝 ' : '📄 '}
                            {e.name}
                          </button>
                        </td>
                        <td>{e.isDirectory ? '—' : formatSize(e.size)}</td>
                        <td>{formatTime(e.modifyTime)}</td>
                        <td>
                          <div className="sftp-row-actions">
                            {!e.isDirectory ? (
                              <>
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={busy || !onOpenRemoteFile}
                                  onClick={() =>
                                    onOpenRemoteFile?.({
                                      remotePath: e.path,
                                      name: e.name,
                                      size: e.size
                                    })
                                  }
                                >
                                  {isLikelyTextFile(e.name) ? tg('sftp.edit') : tg('sftp.preview')}
                                </button>
                                <button type="button" disabled={busy} onClick={() => onDownloadOne(e)}>
                                  {tg('sftp.download')}
                                </button>
                              </>
                            ) : null}
                            <button type="button" disabled={busy} onClick={() => onRename(e)}>
                              {tg('sftp.rename')}
                            </button>
                            <button type="button" disabled={busy} onClick={() => onRemove(e)}>
                              {tg('sftp.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {transfers.length > 0 ? (
              <div className="sftp-transfers">
                <div className="sftp-transfers-title">{tg('sftp.transfers')}</div>
                <ul>
                  {transfers.map((t) => (
                    <li key={t.id}>
                      <div className="sftp-transfer-meta">
                        <span>
                          {t.direction === 'upload' ? '↑' : '↓'} {t.name}
                        </span>
                        <span>
                          {t.status === 'error'
                            ? t.error || tg('sftp.failed')
                            : t.status === 'done'
                              ? tg('sftp.done')
                              : `${pct(t.transferred, t.total)}%`}
                        </span>
                      </div>
                      <div className="sftp-progress">
                        <div
                          className={`sftp-progress-bar${t.status === 'error' ? ' is-error' : ''}${t.status === 'done' ? ' is-done' : ''}`}
                          style={{
                            width: `${t.status === 'done' ? 100 : pct(t.transferred, t.total)}%`
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
