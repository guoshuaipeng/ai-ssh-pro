import { useEffect, useMemo, useRef, useState } from 'react'
import type { BatchExecResult } from '@shared/workspace-features'
import { formatBatchReport, normalizeCommandLine } from '@shared/workspace-features'
import { useI18n, type MessageKey } from '../lib/i18n'
import { notifyHistoryChanged } from '../lib/workspace-events'
import Modal from './Modal'
import CommandInput from './CommandInput'
import { assessCommandRisk } from '../../../shared/command-risk'
import { askConfirm } from '../lib/dialogs'

export type BatchSessionOption = {
  sessionId: string
  title: string
  host: string
  port: number
  username: string
}

type Props = {
  open: boolean
  sessions: BatchSessionOption[]
  /** session ids to tick when opening (e.g. hosts multi-selected in the sidebar) */
  preselect?: string[]
  /** UX-14: render inside a center tab */
  embedded?: boolean
  onClose: () => void
}

const ERROR_KEYS: Record<string, MessageKey> = {
  'not-connected': 'batch.errNotConnected',
  'child-session': 'batch.errChild',
  timeout: 'batch.errTimeout',
  'exec-failed': 'batch.errExec',
  'empty-command': 'batch.errEmpty',
  'no-sessions': 'batch.errNoSessions'
}

export default function BatchExecuteModal({ open, sessions, preselect, onClose, embedded }: Props) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [command, setCommand] = useState('')
  const [running, setRunning] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<BatchExecResult | null>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      const pre = preselect?.filter((id) => sessions.some((s) => s.sessionId === id))
      setSelected(new Set(pre?.length ? pre : sessions.map((s) => s.sessionId)))
      setFormError(null)
      setResult(null)
    }
    wasOpen.current = open
  }, [open, sessions, preselect])

  const selectedCount = useMemo(
    () => sessions.filter((s) => selected.has(s.sessionId)).length,
    [sessions, selected]
  )

  const toggle = (sessionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  const run = async () => {
    const line = normalizeCommandLine(command)
    const ids = sessions.map((s) => s.sessionId).filter((id) => selected.has(id))
    if (!line) {
      setFormError(t('batch.needCommand'))
      return
    }
    if (ids.length === 0) {
      setFormError(t('batch.needSelection'))
      return
    }
    const risk = assessCommandRisk(line)
    if (risk) {
      const ok = await askConfirm(t('risk.title'), `${t('risk.hint', { reason: t(risk.reasonKey) })}\n\n${line}`, { danger: true, okLabel: t('risk.run') })
      if (!ok) {
        setFormError(t('risk.blocked'))
        return
      }
    }
    setFormError(null)
    setRunning(true)
    try {
      const next = await window.aiss.workspace.batchExec({ sessionIds: ids, command: line })
      setResult(next)
      notifyHistoryChanged()
      if (next.error === 'empty-command') setFormError(t('batch.errEmpty'))
      if (next.error === 'no-sessions') setFormError(t('batch.errNoSessions'))
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const [copied, setCopied] = useState(false)
  const copyReport = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(formatBatchReport(result))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e))
    }
  }
  const exportReport = () => {
    if (!result) return
    const blob = new Blob([formatBatchReport(result)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `batch-${new Date(result.startedAt).toISOString().replace(/[:.]/g, '-')}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const errorText = (code?: string) => {
    if (!code) return ''
    const key = ERROR_KEYS[code]
    return key ? t(key) : code
  }

  return (
    <Modal
      open={open || !!embedded}
      embedded={embedded}
      testId="batch-panel"
      title={t('batch.title')}
      onClose={() => {
        if (!running) onClose()
      }}
      width={720}
      footer={
        <>
          {result && result.results.length > 0 ? (
            <>
              <button type="button" onClick={() => void copyReport()} disabled={running}>
                {copied ? t('batch.copied') : t('batch.copyReport')}
              </button>
              <button type="button" onClick={exportReport} disabled={running}>
                {t('batch.exportReport')}
              </button>
            </>
          ) : null}
          {!embedded ? (
            <button type="button" onClick={onClose} disabled={running}>
              {t('batch.close')}
            </button>
          ) : null}
          <button type="button" className="primary" disabled={running || sessions.length === 0} onClick={() => void run()}>
            {running ? t('batch.running') : t('batch.run')}
          </button>
        </>
      }
    >
      <div className="batch-exec">
        <p className="batch-exec-hint">{t('batch.hint')}</p>
        {sessions.length === 0 ? (
          <p className="batch-exec-empty">{t('batch.noSessions')}</p>
        ) : (
          <>
            <div className="batch-exec-toolbar">
              <button
                type="button"
                onClick={() => setSelected(new Set(sessions.map((s) => s.sessionId)))}
              >
                {t('batch.selectAll')}
              </button>
              <button type="button" onClick={() => setSelected(new Set())}>
                {t('batch.clearSelection')}
              </button>
              <span className="batch-exec-count">{selectedCount}</span>
            </div>
            <ul className="batch-exec-sessions">
              {sessions.map((s) => (
                <li key={s.sessionId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(s.sessionId)}
                      onChange={() => toggle(s.sessionId)}
                    />
                    <span className="batch-exec-title">{s.title}</span>
                    <span className="batch-exec-meta">
                      {s.username}@{s.host}:{s.port}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="batch-exec-command-label">{t('batch.command')}</div>
        <CommandInput
          value={command}
          onValueChange={setCommand}
          submitOnEnter={false}
          disabled={running}
          placeholder={t('batch.commandPlaceholder')}
          ariaLabel={t('batch.command')}
        />
        {formError ? <p className="batch-exec-error">{formError}</p> : null}
        <div className="batch-exec-results" aria-live="polite">
          {!result || result.results.length === 0 ? (
            <p className="batch-exec-empty">{t('batch.emptyResult')}</p>
          ) : (
            result.results.map((row) => (
              <article key={row.sessionId} className={`batch-exec-result ${row.ok ? 'is-ok' : 'is-bad'}`}>
                <header>
                  <strong>{row.label || row.sessionId}</strong>
                  <span>
                    {row.username ? `${row.username}@${row.host}:${row.port}` : row.sessionId}
                  </span>
                  <span className="batch-exec-status">
                    {row.ok ? t('batch.ok') : t('batch.failed')}
                    {row.code != null ? ` · ${t('batch.exit', { code: row.code })}` : ''}
                    {` · ${t('batch.elapsed', { ms: row.elapsedMs })}`}
                  </span>
                </header>
                {row.error ? <p className="batch-exec-error">{errorText(row.error)}</p> : null}
                {row.stdout ? (
                  <pre>
                    <span>{t('batch.stdout')}</span>
                    {row.stdout}
                  </pre>
                ) : null}
                {row.stderr ? (
                  <pre className="is-stderr">
                    <span>{t('batch.stderr')}</span>
                    {row.stderr}
                  </pre>
                ) : null}
                {row.truncated ? <p className="batch-exec-note">{t('batch.truncated')}</p> : null}
              </article>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
