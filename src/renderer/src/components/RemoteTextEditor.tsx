import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Select from './ui/Select'
import type { SftpReadTextResult } from '@shared/ipc'
import { clearRemoteFileDirty, setRemoteFileDirty } from '../lib/remote-file-dirty'
import { tg, useI18n } from '../lib/i18n'
import { confirmDialog } from '../lib/dialogs'
import { detectLang, diffLines, diffStats, highlightToHtml, type LangId } from '../lib/simple-highlight'
import { friendlyErrorMessage } from '../lib/friendly-error'
import { snapshotsEnabled } from '@shared/snapshots'
import { showToast } from '../lib/toast'
import Icon from './Icon'
import Button from './ui/Button'
import PanelHeader from './ui/PanelHeader'
import { AUTO_SAVE_DELAY_MS, planAutoSave, remoteChanged } from '@shared/remote-edit'

type Props = {
  tabId: string
  sessionId: string
  remotePath: string
  onClose: () => void
  onTitleChange?: (title: string) => void
  /** Same C1 gate as SFTP mkdir/rename. Read-only hosts must not write. */
  beforeRemoteWrite?: () => Promise<boolean>
  remoteWritesBlocked?: boolean
  profileId?: string
  onOpenHistory?: () => void
}

const TEXT_EXT =
  /\.(txt|md|markdown|json|ya?ml|xml|html?|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|rb|php|go|rs|java|kt|c|cc|cpp|h|hpp|cs|sql|sh|bash|zsh|fish|ps1|bat|cmd|ini|conf|cfg|env|toml|properties|log|service|timer|socket|desktop|vue|svelte|r|lua|pl|swift|m|mm|gradle|cmake|makefile|dockerfile|gitignore|editorconfig|npmrc|prettierrc|eslintrc)(\.|$)/i

export function isLikelyTextFile(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  if (TEXT_EXT.test(n)) return true
  const base = n.split('/').pop() || n
  return /^(Dockerfile|Makefile|Jenkinsfile|Vagrantfile|README|LICENSE|CHANGELOG|hosts|\.bashrc|\.profile|\.zshrc|\.vimrc)$/i.test(base)
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

const SHOW_DIFF_KEY = 'aiss.editor.showDiffBeforeSave'
const BAK_KEY = 'aiss.editor.bakOnSave'
const AUTO_KEY = 'aiss.editor.autoSave'

export default function RemoteTextEditor({
  tabId,
  sessionId,
  remotePath,
  onClose,
  onTitleChange,
  beforeRemoteWrite,
  remoteWritesBlocked = false,
  profileId,
  onOpenHistory
}: Props) {
  const { locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [baseline, setBaseline] = useState('')
  const [meta, setMeta] = useState<Pick<SftpReadTextResult, 'size' | 'truncated'> | null>(null)
  const [mode, setMode] = useState<'edit' | 'diff' | 'conflict'>('edit')
  // D5: remote content when it changed under us; auto-save preference
  const [conflict, setConflict] = useState<string | null>(null)
  const [autoPref, setAutoPref] = useState(() => localStorage.getItem(AUTO_KEY) === '1')
  const [lang, setLang] = useState<LangId>('text')
  const [showDiffPref, setShowDiffPref] = useState(() => localStorage.getItem(SHOW_DIFF_KEY) !== '0')
  const [bakPref, setBakPref] = useState(() => localStorage.getItem(BAK_KEY) === '1')
  const [hlOff, setHlOff] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  const dirty = content !== baseline
  const fileName = useMemo(() => basename(remotePath), [remotePath])
  const diff = useMemo(
    () => (mode === 'diff' ? diffLines(baseline, content) : mode === 'conflict' && conflict != null ? diffLines(conflict, content) : []),
    [mode, baseline, content, conflict]
  )
  const stats = useMemo(() => diffStats(diff), [diff])

  useEffect(() => {
    setRemoteFileDirty(tabId, dirty)
    onTitleChange?.(dirty ? `● ${fileName}` : fileName)
  }, [dirty, fileName, onTitleChange, tabId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatus(null)
    setMode('edit')
    setConflict(null)
    try {
      const res = await window.aiss.sftp.readText(sessionId, remotePath)
      setContent(res.content)
      setBaseline(res.content)
      setMeta({ size: res.size, truncated: res.truncated })
      setRemoteFileDirty(tabId, false)
      const detected = detectLang(remotePath, res.content)
      setLang(detected)
      const big = res.content.length > 2 * 1024 * 1024
      setHlOff(big)
      if (res.truncated) setStatus(tg('ui.258', { 0: String(formatSize(res.content.length)) }))
      if (big) setStatus(tg('d4.hlOff'))
    } catch (e) {
      setError(friendlyErrorMessage(e, locale === 'en' ? 'en' : 'zh-CN'))
    } finally {
      setLoading(false)
    }
  }, [remotePath, sessionId, tabId, locale])

  useEffect(() => {
    void load()
    return () => clearRemoteFileDirty(tabId)
  }, [load, tabId])

  const doSave = useCallback(async (opts?: { force?: boolean; auto?: boolean }) => {
    if (saving || loading) return
    if (meta?.truncated) {
      setError(tg('ui.259'))
      return
    }
    setSaving(true)
    setError(null)
    setStatus(tg('ui.260'))
    try {
      // D5: refuse to overwrite a file that changed on the server since we read it
      if (!opts?.force && !remoteWritesBlocked) {
        const now = await window.aiss.sftp.readText(sessionId, remotePath)
        if (remoteChanged(baseline, now)) {
          setConflict(now.content)
          setStatus(null)
          setMode('edit')
          return
        }
      }
      if (beforeRemoteWrite && !(await beforeRemoteWrite())) {
        setError(remoteWritesBlocked ? tg('l4.readonlyBlocked') : null)
        setStatus(null)
        return
      }
      if (!beforeRemoteWrite && remoteWritesBlocked) {
        setError(tg('l4.readonlyBlocked'))
        setStatus(null)
        return
      }
      let snapped = false
      if (profileId && snapshotsEnabled() && window.aiss?.snapshots?.put) {
        try {
          const kept = await window.aiss.snapshots.put({ profileId, path: remotePath, content: baseline, source: 'edit', isText: true })
          snapped = Boolean(kept.added || kept.skipped === 'duplicate')
        } catch (err) {
          showToast(tg('w3.snapFail', { reason: err instanceof Error ? err.message : String(err) }))
        }
      }
      if (bakPref) {
        try {
          await window.aiss.sftp.writeText(sessionId, `${remotePath}.bak`, baseline)
        } catch {
          /* bak best-effort */
        }
      }
      await window.aiss.sftp.writeText(sessionId, remotePath, content)
      setBaseline(content)
      setConflict(null)
      setRemoteFileDirty(tabId, false)
      setMeta((m) => (m ? { ...m, size: new TextEncoder().encode(content).length, truncated: false } : m))
      setStatus(
        opts?.auto
          ? tg('d5.autoSaved', { t: new Date().toLocaleTimeString() })
          : snapped
            ? tg('w3.savedWithSnap')
            : tg('ui.261', { 0: String(new Date().toLocaleTimeString()) })
      )
      setMode('edit')
    } catch (e) {
      setError(friendlyErrorMessage(e, locale === 'en' ? 'en' : 'zh-CN'))
      setStatus(null)
    } finally {
      setSaving(false)
    }
  }, [bakPref, baseline, beforeRemoteWrite, content, loading, locale, meta?.truncated, profileId, remotePath, remoteWritesBlocked, saving, sessionId, tabId])

  // D5: auto-save after a short pause (skips the diff preview; conflicts still stop it)
  useEffect(() => {
    if (!planAutoSave({ enabled: autoPref, dirty, blocked: remoteWritesBlocked, truncated: Boolean(meta?.truncated), conflict: conflict != null, saving, loading, mode })) return
    const t = window.setTimeout(() => void doSave({ auto: true }), AUTO_SAVE_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [autoPref, conflict, content, dirty, doSave, loading, meta?.truncated, mode, remoteWritesBlocked, saving])

  const requestSave = useCallback(() => {
    if (!dirty || saving || loading || meta?.truncated) return
    if (remoteWritesBlocked) {
      void doSave()
      return
    }
    if (showDiffPref) setMode('diff')
    else void doSave()
  }, [dirty, doSave, loading, meta?.truncated, remoteWritesBlocked, saving, showDiffPref])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.key.toLowerCase() !== 's') return
      const t = e.target as HTMLElement | null
      if (t?.closest?.('.xterm') || t?.closest?.('[data-terminal]')) return
      e.preventDefault()
      if (mode === 'diff') void doSave()
      else requestSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doSave, mode, requestSave])

  const requestClose = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: tg('dlg.confirmTitle'),
        body: tg('ui.262'),
        danger: true,
        confirmText: tg('dlg.discard')
      })
      if (!ok) return
    }
    clearRemoteFileDirty(tabId)
    onClose()
  }

  const lines = content.length ? content.split('\n').length : 1
  const html = useMemo(() => (hlOff || lang === 'text' ? '' : highlightToHtml(content, lang)), [content, hlOff, lang])

  const syncScroll = () => {
    const ta = textareaRef.current
    const pre = preRef.current
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop
      pre.scrollLeft = ta.scrollLeft
    }
  }

  return (
    <div className="workspace-panel workspace-panel--remote-file" data-testid="remote-text-editor">
      <PanelHeader
        leadClassName="remote-file-toolbar-left"
        title={dirty ? `● ${fileName}` : fileName}
        aside={
          <>
            <span className="remote-file-path" title={remotePath}>
              {remotePath}
            </span>
          </>
        }
        actions={
          <>
            {mode === 'edit' ? (
              <>
                <label
                  className="remote-file-autosave"
                  data-testid="remote-autosave"
                  title={remoteWritesBlocked ? tg('l4.readonlyBlocked') : tg('d5.autoHint')}
                >
                  <input
                    type="checkbox"
                    checked={autoPref && !remoteWritesBlocked}
                    disabled={remoteWritesBlocked}
                    onChange={(e) => {
                      setAutoPref(e.target.checked)
                      localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0')
                    }}
                  />
                  {tg('d5.auto')}
                </label>
                <label className="remote-file-autosave" title={tg('d4.showDiff')}>
                  <input
                    type="checkbox"
                    checked={showDiffPref}
                    onChange={(e) => {
                      setShowDiffPref(e.target.checked)
                      localStorage.setItem(SHOW_DIFF_KEY, e.target.checked ? '1' : '0')
                    }}
                  />
                  {tg('d4.showDiff')}
                </label>
                <label className="remote-file-autosave" title={tg('d4.bak')}>
                  <input
                    type="checkbox"
                    checked={bakPref}
                    onChange={(e) => {
                      setBakPref(e.target.checked)
                      localStorage.setItem(BAK_KEY, e.target.checked ? '1' : '0')
                    }}
                  />
                  {tg('d4.bak')}
                </label>
                <span className="l7-muted">{tg('w3.bakHint')}</span>
                {onOpenHistory ? (
                  <button type="button" title={tg('w3.history')} data-testid="w3-history" onClick={onOpenHistory}>
                    <Icon name="history" size={16} />
                  </button>
                ) : null}
                <button type="button" disabled={loading || saving} onClick={() => void load()}>
                  {tg('ui.264')}
                </button>
                <Button variant="primary"
                  disabled={loading || saving || !dirty || Boolean(meta?.truncated) || remoteWritesBlocked}
                  title={remoteWritesBlocked ? tg('l4.readonlyBlocked') : undefined}
                  onClick={() => requestSave()}
                >
                  {saving ? tg('ui.185') : tg('ui.265')}
                </Button>
              </>
            ) : (
              <>
                <span className="d4-stats">
                  {tg('d4.stats', { a: stats.add, d: stats.del })}
                </span>
                <button type="button" onClick={() => setMode('edit')}>
                  {tg('d4.backEdit')}
                </button>
                <Button variant="primary"
                  disabled={saving || remoteWritesBlocked}
                  title={remoteWritesBlocked ? tg('l4.readonlyBlocked') : undefined}
                  onClick={() => void doSave(mode === 'conflict' ? { force: true } : undefined)}
                >
                  {saving ? tg('ui.185') : mode === 'conflict' ? tg('d5.overwrite') : tg('d4.saveServer')}
                </Button>
              </>
            )}
            <button type="button" onClick={() => void requestClose()} disabled={saving}>
              {tg('ui.27')}
            </button>
          </>
        }
      />

      <div className="remote-file-statusbar">
        <span>{dirty ? tg('ui.266') : tg('ui.267')}</span>
        <label>
          <Select testId="rte-lang" ariaLabel={tg('d4.lang')} value={lang} options={(['text', 'shell', 'yaml', 'json', 'ini', 'dockerfile', 'python', 'js', 'sql', 'xml', 'markdown', 'nginx'] as LangId[]).map((l) => ({ value: l, label: l }))} onChange={(v) => setLang(v as LangId)} />
        </label>
        <span>UTF-8</span>
        <span>
          {lines} {tg('ui.268')}
        </span>
        {meta ? <span>{formatSize(meta.size)}</span> : null}
        {status ? <span className="remote-file-status-msg">{status}</span> : null}
        <span className="remote-file-shortcut">{tg('ui.269')}</span>
      </div>

      {conflict != null ? (
        <div className="remote-file-conflict" data-testid="remote-conflict" role="alert">
          <span>{tg('d5.conflict')}</span>
          <button type="button" data-testid="remote-conflict-diff" onClick={() => setMode('conflict')}>
            {tg('d5.viewDiff')}
          </button>
          <button
            type="button"
            data-testid="remote-conflict-overwrite"
            disabled={saving || remoteWritesBlocked}
            title={remoteWritesBlocked ? tg('l4.readonlyBlocked') : undefined}
            onClick={() => void doSave({ force: true })}
          >
            {tg('d5.overwrite')}
          </button>
          <button
            type="button"
            data-testid="remote-conflict-discard"
            onClick={() => {
              setContent(conflict)
              setBaseline(conflict)
              setConflict(null)
              setMode('edit')
              setStatus(tg('d5.reloaded'))
            }}
          >
            {tg('d5.discard')}
          </button>
        </div>
      ) : null}
      {error ? <div className="remote-file-error">{error}</div> : null}

      <div className="remote-file-editor-wrap">
        {loading ? (
          <div className="remote-file-loading">{tg('ui.270')}</div>
        ) : error && !content ? (
          <div className="remote-file-loading">{tg('ui.271')}</div>
        ) : mode !== 'edit' ? (
          <div className="d4-diff" data-testid="remote-diff">
            {mode === 'conflict' ? <div className="d5-diff-legend">{tg('d5.diffLegend')}</div> : null}
            {diff.map((l, i) => (
              <div key={i} className={`d4-line d4-${l.type}`}>
                <span className="d4-gutter">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
                <code>{l.text || ' '}</code>
              </div>
            ))}
          </div>
        ) : (
          <div className="d4-editor-stack">
            {!hlOff && lang !== 'text' ? (
              <pre
                ref={preRef}
                className="d4-highlight remote-file-editor"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: html + '\n' }}
              />
            ) : null}
            <textarea
              ref={textareaRef}
              className={`remote-file-editor${hlOff || lang === 'text' ? '' : ' d4-overlay'}`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onScroll={syncScroll}
              spellCheck={false}
              wrap="off"
              readOnly={Boolean(meta?.truncated)}
              aria-label={tg('ui.272', { 0: String(fileName) })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
