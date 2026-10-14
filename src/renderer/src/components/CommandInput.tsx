import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react'
import { filterCommandHistory, normalizeCommandLine } from '@shared/workspace-features'
import { useI18n } from '../lib/i18n'
import { HISTORY_CHANGED_EVENT, notifyHistoryChanged } from '../lib/workspace-events'

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
  /** marker shown inside the field on the left (A2: ✨) */
  prefix?: ReactNode
  inputRef?: Ref<HTMLInputElement>
  /** history suggestions (off in AI mode) */
  suggest?: boolean
  className?: string
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
  className
}: Props) {
  const { t } = useI18n()
  const listId = useId()
  const [history, setHistory] = useState<string[]>([])
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
    if (!api) return
    void api
      .list()
      .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
      .catch(() => {
        /* ignore */
      })
  }, [])

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

  const suggestions = suggest ? filterCommandHistory(history, text, 8) : []

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
            if (history.length === 0) return
            e.preventDefault()
            setOpen(false)
            setHighlight(-1)
            const next =
              e.key === 'ArrowUp'
                ? Math.min(history.length - 1, historyCursor + 1)
                : Math.max(-1, historyCursor - 1)
            if (historyCursor === -1) draftRef.current = text
            setHistoryCursor(next)
            setText(next === -1 ? draftRef.current : history[next] ?? '')
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (highlight >= 0 && suggestions[highlight]) {
              fill(suggestions[highlight])
              return
            }
            submit()
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <ul className="command-input-suggest" id={listId} role="listbox" aria-label={t('history.suggestions')}>
          {suggestions.map((cmd, index) => (
            <li key={cmd}>
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
                {cmd}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      </div>
      {submitOnEnter ? (
        <button type="button" disabled={disabled || !canSubmit} onClick={submit}>
          {t('history.send')}
        </button>
      ) : null}
    </div>
  )
}
