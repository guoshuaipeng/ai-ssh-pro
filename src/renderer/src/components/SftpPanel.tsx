import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SftpListEntry, SftpListResult, SftpProgressEvent } from '@shared/ipc'
import { isLikelyTextFile } from './RemoteTextEditor'

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
        setError('无活动 SSH 会话')
        return
      }
      const api = getSftpApi()
      if (!api) {
        setError('SFTP API 未就绪，请重启应用')
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
      if (
        window.confirm(
          `「${entry.name}」可能不是常见文本文件。仍要以文本方式打开预览/编辑吗？`
        )
      ) {
        onOpenRemoteFile({ remotePath: entry.path, name: entry.name, size: entry.size })
      }
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
      if (!api) throw new Error('SFTP API 未就绪')
      for (const localPath of files) {
        const name = localPath.replace(/\\/g, '/').split('/').pop() || 'upload.bin'
        const remote = cwd === '/' ? `/${name}` : `${cwd.replace(/\/+$/, '')}/${name}`
        const transferId = `ul-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        await api.upload(sessionId, localPath, remote, transferId)
      }
      setHint(`已上传 ${files.length} 个文件`)
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
      if (!api) throw new Error('SFTP API 未就绪')
      const local = await api.pickDownloadPath(entry.name)
      if (!local) return
      const transferId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      await api.download(sessionId, entry.path, local, transferId)
      setHint(`已下载 ${entry.name}`)
    }, true)
  }

  const onDownloadSelected = () => {
    const files = selectedEntries.filter((e) => !e.isDirectory)
    if (!sessionId || files.length === 0) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error('SFTP API 未就绪')
      if (files.length === 1) {
        const local = await api.pickDownloadPath(files[0]!.name)
        if (!local) return
        const transferId = `dl-${Date.now()}`
        await api.download(sessionId, files[0]!.path, local, transferId)
        setHint(`已下载 ${files[0]!.name}`)
        return
      }
      if (!api.pickSavePaths) throw new Error('请更新应用以支持批量下载')
      const locals = await api.pickSavePaths(files.map((f) => f.name))
      if (!locals?.length) return
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!
        const local = locals[i]
        if (!local) continue
        const transferId = `dl-${Date.now()}-${i}`
        await api.download(sessionId, f.path, local, transferId)
      }
      setHint(`已下载 ${files.length} 个文件`)
    }, true)
  }

  const onMkdir = () => {
    if (!sessionId) return
    const name = window.prompt('新目录名称')
    if (!name?.trim()) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error('SFTP API 未就绪')
      const remote = cwd === '/' ? `/${name.trim()}` : `${cwd.replace(/\/+$/, '')}/${name.trim()}`
      await api.mkdir(sessionId, remote)
    })
  }

  const onRemove = (entry: SftpListEntry) => {
    if (!sessionId) return
    if (!window.confirm(`确定删除「${entry.name}」？`)) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error('SFTP API 未就绪')
      await api.remove(sessionId, entry.path)
    })
  }

  const onRename = (entry: SftpListEntry) => {
    if (!sessionId) return
    const next = window.prompt('新名称', entry.name)
    if (!next?.trim() || next.trim() === entry.name) return
    void runBusy(async () => {
      const api = getSftpApi()
      if (!api) throw new Error('SFTP API 未就绪')
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
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p))
    if (!paths.length) {
      setError('拖放上传需要本机文件路径（请从资源管理器拖入）')
      return
    }
    void uploadLocals(paths)
  }

  return (
    <div className="workspace-panel workspace-panel--sftp">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">
          文件传输{sessionTitle ? ` · ${sessionTitle}` : ''}
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" disabled={!sessionId || busy} onClick={() => void goHome()}>
            家目录
          </button>
          <button type="button" disabled={!sessionId || busy} onClick={() => void refresh(cwd)}>
            刷新
          </button>
          <button type="button" disabled={!sessionId || busy} onClick={onMkdir}>
            新建目录
          </button>
          <button
            type="button"
            disabled={!sessionId || busy || selectedEntries.every((e) => e.isDirectory)}
            onClick={onDownloadSelected}
          >
            下载选中
          </button>
          <button type="button" className="primary" disabled={!sessionId || busy} onClick={onUpload}>
            上传
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            关闭
          </button>
        </div>
      </div>

      <div className="workspace-panel-body workspace-panel-body--sftp">
        {!sessionId ? (
          <p className="sftp-empty">请先打开并激活一个 SSH 会话，再使用文件传输。</p>
        ) : (
          <>
            <div className="sftp-pathbar">
              <button type="button" disabled={cwd === '/' || loading || busy} onClick={goUp}>
                上级
              </button>
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitPath()
                }}
                aria-label="远端路径"
                spellCheck={false}
              />
              <button type="button" disabled={busy || loading} onClick={submitPath}>
                转到
              </button>
            </div>

            <p className="sftp-hint">
              双击文本文件可预览/编辑，保存后写回服务器。也支持拖放上传；远端 <code>sz</code> / <code>rz</code>{' '}
              走终端 Zmodem。
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
                <div className="sftp-empty">加载中…</div>
              ) : entries.length === 0 ? (
                <div className="sftp-empty">目录为空 — 可将本地文件拖到此处上传</div>
              ) : (
                <table className="sftp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th>名称</th>
                      <th style={{ width: 100 }}>大小</th>
                      <th style={{ width: 160 }}>修改时间</th>
                      <th style={{ width: 220 }}>操作</th>
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
                                  {isLikelyTextFile(e.name) ? '编辑' : '预览'}
                                </button>
                                <button type="button" disabled={busy} onClick={() => onDownloadOne(e)}>
                                  下载
                                </button>
                              </>
                            ) : null}
                            <button type="button" disabled={busy} onClick={() => onRename(e)}>
                              重命名
                            </button>
                            <button type="button" disabled={busy} onClick={() => onRemove(e)}>
                              删除
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
                <div className="sftp-transfers-title">传输任务</div>
                <ul>
                  {transfers.map((t) => (
                    <li key={t.id}>
                      <div className="sftp-transfer-meta">
                        <span>
                          {t.direction === 'upload' ? '↑' : '↓'} {t.name}
                        </span>
                        <span>
                          {t.status === 'error'
                            ? t.error || '失败'
                            : t.status === 'done'
                              ? '完成'
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
