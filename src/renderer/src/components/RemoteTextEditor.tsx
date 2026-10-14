import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SftpReadTextResult } from '@shared/ipc'
import { clearRemoteFileDirty, setRemoteFileDirty } from '../lib/remote-file-dirty'
import { tg } from '../lib/i18n'

type Props = {
  tabId: string
  sessionId: string
  remotePath: string
  onClose: () => void
  onTitleChange?: (title: string) => void
}

const TEXT_EXT =
  /\.(txt|md|markdown|json|ya?ml|xml|html?|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|rb|php|go|rs|java|kt|c|cc|cpp|h|hpp|cs|sql|sh|bash|zsh|fish|ps1|bat|cmd|ini|conf|cfg|env|toml|properties|log|service|timer|socket|desktop|vue|svelte|r|lua|pl|swift|m|mm|gradle|cmake|makefile|dockerfile|gitignore|editorconfig|npmrc|prettierrc|eslintrc)(\.|$)/i

export function isLikelyTextFile(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  if (TEXT_EXT.test(n)) return true
  // 无后缀常见配置
  const base = n.split('/').pop() || n
  return /^(Dockerfile|Makefile|Jenkinsfile|Vagrantfile|README|LICENSE|CHANGELOG|hosts|\.bashrc|\.profile|\.zshrc|\.vimrc)$/i.test(
    base
  )
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function basename(path: string): string {
  const p = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}

export default function RemoteTextEditor({
  tabId,
  sessionId,
  remotePath,
  onClose,
  onTitleChange
}: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [baseline, setBaseline] = useState('')
  const [meta, setMeta] = useState<Pick<SftpReadTextResult, 'size' | 'truncated'> | null>(null)
  const [autoSave, setAutoSave] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<number | null>(null)

  const dirty = content !== baseline
  const fileName = useMemo(() => basename(remotePath), [remotePath])

  useEffect(() => {
    setRemoteFileDirty(tabId, dirty)
    onTitleChange?.(dirty ? `● ${fileName}` : fileName)
    return () => {
      /* keep dirty flag until close clears */
    }
  }, [dirty, fileName, onTitleChange, tabId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatus(null)
    try {
      const res = await window.aiss.sftp.readText(sessionId, remotePath)
      setContent(res.content)
      setBaseline(res.content)
      setMeta({ size: res.size, truncated: res.truncated })
      setRemoteFileDirty(tabId, false)
      if (res.truncated) {
        setStatus(tg('ui.258', { 0: String(formatSize(res.content.length)) }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [remotePath, sessionId, tabId])

  useEffect(() => {
    void load()
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      clearRemoteFileDirty(tabId)
    }
  }, [load, tabId])

  const save = useCallback(async () => {
    if (saving || loading) return
    if (meta?.truncated) {
      setError(tg('ui.259'))
      return
    }
    setSaving(true)
    setError(null)
    setStatus(tg('ui.260'))
    try {
      await window.aiss.sftp.writeText(sessionId, remotePath, content)
      setBaseline(content)
      setRemoteFileDirty(tabId, false)
      setMeta((m) => (m ? { ...m, size: new TextEncoder().encode(content).length, truncated: false } : m))
      setStatus(tg('ui.261', { 0: String(new Date().toLocaleTimeString()) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(null)
    } finally {
      setSaving(false)
    }
  }, [content, loading, meta?.truncated, remotePath, saving, sessionId, tabId])

  // 自动保存（防抖）
  useEffect(() => {
    if (!autoSave || !dirty || loading || saving || meta?.truncated) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void save()
    }, 1200)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [autoSave, content, dirty, loading, meta?.truncated, save, saving])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  const requestClose = () => {
    if (dirty && !window.confirm(tg('ui.262'))) return
    clearRemoteFileDirty(tabId)
    onClose()
  }

  const lines = content.length ? content.split('\n').length : 1

  return (
    <div className="workspace-panel workspace-panel--remote-file">
      <div className="workspace-panel-toolbar">
        <div className="remote-file-toolbar-left">
          <h2 className="workspace-panel-title">{dirty ? `● ${fileName}` : fileName}</h2>
          <span className="remote-file-path" title={remotePath}>
            {remotePath}
          </span>
        </div>
        <div className="workspace-panel-actions">
          <label className="remote-file-autosave">
            <input
              type="checkbox"
              checked={autoSave}
              disabled={Boolean(meta?.truncated)}
              onChange={(e) => setAutoSave(e.target.checked)}
            />
            {tg('ui.263')}
          </label>
          <button type="button" disabled={loading || saving} onClick={() => void load()}>
            {tg('ui.264')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={loading || saving || !dirty || Boolean(meta?.truncated)}
            onClick={() => void save()}
          >
            {saving ? tg('ui.185') : tg('ui.265')}
          </button>
          <button type="button" onClick={requestClose} disabled={saving}>
            {tg('ui.27')}
          </button>
        </div>
      </div>

      <div className="remote-file-statusbar">
        <span>{dirty ? tg('ui.266') : tg('ui.267')}</span>
        <span>UTF-8</span>
        <span>{lines} {' '}{tg('ui.268')}</span>
        {meta ? <span>{formatSize(meta.size)}</span> : null}
        {status ? <span className="remote-file-status-msg">{status}</span> : null}
        <span className="remote-file-shortcut">{tg('ui.269')}</span>
      </div>

      {error ? <div className="remote-file-error">{error}</div> : null}

      <div className="remote-file-editor-wrap">
        {loading ? (
          <div className="remote-file-loading">{tg('ui.270')}</div>
        ) : error && !content ? (
          <div className="remote-file-loading">{tg('ui.271')}</div>
        ) : (
          <textarea
            ref={textareaRef}
            className="remote-file-editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            wrap="off"
            readOnly={Boolean(meta?.truncated)}
            aria-label={tg('ui.272', { 0: String(fileName) })}
          />
        )}
      </div>
    </div>
  )
}
