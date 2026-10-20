import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react'
import { filterCommandHistory, normalizeCommandLine } from '@shared/workspace-features'
import { highlightMatch, rankSuggestions, type HistoryEntry, type Suggestion } from '@shared/smart-complete'
import { useI18n } from '../lib/i18n'
import { HISTORY_CHANGED_EVENT, notifyHistoryChanged } from '../lib/workspace-events'
import { loadSmartHistory, loadSmartPrefs } from '../lib/smart-history'
import { lastCwdOf, lastExitOf, upHistoryList } from '@shared/history-exit'

type Props = {
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  /** When false, Enter never submits (batch execute requires an explicit button). */
  submitOnEnter?: boolean
  onSubmit?: (command: string) => void
  value?: string
  onValueChange?: (value: string) => void
  /** return true to consume the key before the built-in history / submit handling (A2 AI mode) */
  interceptKey?: (e: ReactKeyboardEvent<HTMLInputElement>) => boolean
  /** marker shown inside the field on the left (A2 sparkles) */
  prefix?: ReactNode
  inputRef?: Ref<HTMLInputElement>
  /** history suggestions (off in AI mode) */
  suggest?: boolean
  className?: string
  /** X1: ranked history + Tab accepts without running */
  smart?: boolean
  hostKey?: string
  snippets?: { command: string }[]
  submitLabel?: string
  onStop?: () => void
  stopping?: boolean
  /** D22b: ask AI about a history item that failed last time */
  onAskFailed?: (command: string, code: number) => void
}

export default function CommandInput({
  placeholder,
  ariaLabel,
  disabled = false,
  submitOnEnter = false,
  onSubmit,
  value,
  onValueChange,
  interceptKey,
  prefix,
  inputRef,
  suggest = true,
  className,
  smart = false,
  hostKey = '',
  snippets = [],
  onAskFailed,
  submitLabel,
  onStop,
  stopping = false
}: Props) {
  const { t } = useI18n()
  const listId = useId()
  const [history, setHistory] = useState<string[]>([])
  const [smartRows, setSmartRows] = useState<HistoryEntry[]>([])
  const [inner, setInner] = useState('')
  const text = value ?? inner
  const setText = onValueChange ?? setInner
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [historyCursor, setHistoryCursor] = useState(-1)
  const draftRef = useRef('')
  const rootRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(() => {
    const api = window.aiss?.workspace?.commandHistory
    if (api) {
      void api
        .list()
        .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
        .catch(() => {
          /* ignore */
        })
    }
    if (smart) setSmartRows(loadSmartHistory())
  }, [smart])

  useEffect(() => {
    reload()
    const onChange = () => reload()
    window.addEventListener(HISTORY_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, onChange)
  }, [reload])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const prefs = smart ? loadSmartPrefs() : null
  const ranked: Suggestion[] =
    smart && suggest && prefs?.enabled
      ? rankSuggestions({
          query: text,
          hostKey,
          entries: smartRows.length ? smartRows : history.map((command) => ({ command, hostKey: '', count: 1, lastUsed: 0 })),
          snippets,
          sources: { host: prefs.sourceHost, common: prefs.sourceCommon, snippets: prefs.sourceSnippets },
          limit: 6,
          minChars: 2
        })
      : []
  const suggestions = smart ? ranked.map((s) => s.command) : suggest ? filterCommandHistory(history, text, 8) : []
  // D22: ↑ walks this host's commands first
  const upList = smart && hostKey && smartRows.length ? upHistoryList(hostKey, smartRows, history) : history

  const fill = (command: string) => {
    setText(command)
    setOpen(false)
    setHighlight(-1)
    setHistoryCursor(-1)
    draftRef.current = command
  }

  const submit = () => {
    if (!submitOnEnter || !onSubmit || disabled) return
    const command = normalizeCommandLine(text)
    if (!command) return
    onSubmit(command)
    setText('')
    draftRef.current = ''
    setHistoryCursor(-1)
    setOpen(false)
    notifyHistoryChanged()
  }

  const canSubmit = Boolean(normalizeCommandLine(text))

  return (
    <div className={`command-input${className ? ` ${className}` : ''}`} ref={rootRef}>
      <div className="command-input-field">
      {prefix}
      <input
        ref={inputRef}
        type="text"
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? t('history.placeholder')}
        aria-label={ariaLabel ?? t('history.aria')}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onFocus={() => {
          setOpen(true)
          reload()
        }}
        onChange={(e) => {
          setText(e.target.value)
          draftRef.current = e.target.value
          setHistoryCursor(-1)
          setHighlight(-1)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (interceptKey?.(e)) {
            e.preventDefault()
            return
          }
          if (e.key === 'Escape') {
            setOpen(false)
            setHighlight(-1)
            return
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            const browsingSuggestions = text.trim().length > 0 && suggestions.length > 0 && open
            if (browsingSuggestions) {
              e.preventDefault()
              setHighlight((cur) => {
                if (e.key === 'ArrowDown') return cur >= suggestions.length - 1 ? 0 : cur + 1
                return cur <= 0 ? suggestions.length - 1 : cur - 1
              })
              return
            }
            if (upList.length === 0) return
            e.preventDefault()
            setOpen(false)
            setHighlight(-1)
            const next =
              e.key === 'ArrowUp'
                ? Math.min(upList.length - 1, historyCursor + 1)
                : Math.max(-1, historyCursor - 1)
            if (historyCursor === -1) draftRef.current = text
            setHistoryCursor(next)
            setText(next === -1 ? draftRef.current : upList[next] ?? '')
            return
          }
          if (e.key === 'Tab' && smart && open && suggestions.length > 0) {
            e.preventDefault()
            fill(suggestions[highlight >= 0 ? highlight : 0]!)
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (open && suggestions.length > 0 && (highlight >= 0 || smart)) {
              fill(suggestions[highlight >= 0 ? highlight : 0]!)
              return
            }
            submit()
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <ul className={`command-input-suggest${smart ? ' is-above' : ''}`} id={listId} role="listbox" aria-label={t('history.suggestions')} data-testid="cmd-suggest">
          {suggestions.map((cmd, index) => {
            const meta = ranked[index]
            const parts = smart ? highlightMatch(cmd, text) : null
            const sourceLabel = meta?.source === 'host' ? t('x1.host') : meta?.source === 'snippet' ? t('x1.snippet') : t('x1.common')
            return (
              <li key={`${cmd}-${index}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  className={index === highlight ? 'is-active' : ''}
                  onMouseDown={(ev) => {
                    ev.preventDefault()
                    fill(cmd)
                  }}
                >
                  {parts ? (
                    <span className="cmd-suggest-text">
                      {parts.before}
                      <strong>{parts.match}</strong>
                      {parts.after}
                    </span>
                  ) : (
                    cmd
                  )}
                  {smart && meta ? (
                    <span className="cmd-suggest-meta">
                      <span className={`cmd-src cmd-src--${meta.source}`}>{sourceLabel}</span>
                      {(() => {
                        const dir = lastCwdOf(smartRows, hostKey, cmd)
                        return dir ? <span className="cmd-src cmd-cwd" data-testid="suggest-cwd" title={t('d31.cwdTip', { dir })}>{dir}</span> : null
                      })()}
                        {(() => {
                          const code = lastExitOf(smartRows, hostKey, cmd)
                          return typeof code === 'number' && code !== 0 ? (
                            <>
                              <span className="cmd-src cmd-src--failed" data-testid="suggest-failed" title={t('d22.failedTip', { code })}>{t('d22.failed', { code })}</span>
                              {onAskFailed ? (
                                <span
                                  role="button"
                                  tabIndex={-1}
                                  className="cmd-src cmd-ask-failed"
                                  data-testid="suggest-ask-failed"
                                  title={t('d22b.askTip')}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onAskFailed(cmd, code)
                                  }}
                                >
                                  {t('d22b.ask')}
                                </span>
                              ) : null}
                            </>
                          ) : null
                        })()}
                      {meta.count > 0 ? <span>{meta.count}</span> : null}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      </div>
      {submitOnEnter ? (
        <button
          type="button"
          className="command-input-submit"
          disabled={stopping ? false : disabled || !canSubmit}
          onClick={() => {
            if (stopping) onStop?.()
            else submit()
          }}
        >
          {stopping ? t('ux36.stop') : submitLabel || t('history.send')}
        </button>
      ) : null}
    </div>
  )
}
