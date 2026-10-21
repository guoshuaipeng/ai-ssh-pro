/** c53 AA1: a prefilled app-action form proposed by the AI. Nothing runs until the user confirms. */
import { useReducer, useRef } from 'react'
import Select from './ui/Select'
import Button from './ui/Button'
import { tg, type MessageKey } from '../lib/i18n'
import {
  cardReducer,
  getAction,
  initialValues,
  missingFields,
  visibleFields,
  type ActionResult,
  type AppActionProposal,
  type CardState
} from '@shared/ai-actions'

type Props = {
  proposal: AppActionProposal
  onRun?: (name: string, values: Record<string, string>) => Promise<ActionResult> | ActionResult
}

export default function AiActionCard({ proposal, onRun }: Props) {
  const def = getAction(proposal.name)
  const [s, dispatch] = useReducer(
    (st: CardState, e: Parameters<typeof cardReducer>[2]) => (def ? cardReducer(def, st, e) : st),
    undefined,
    (): CardState => ({ phase: 'editing', values: def ? initialValues(def, proposal.params) : {}, showMissing: false })
  )
  const busy = useRef(false)
  if (!def) return null
  const missing = missingFields(def, s.values)
  const missingKeys = new Set(missing.map((f) => f.key))
  const open = s.phase === 'editing' || s.phase === 'error'

  const runConfirmed = async () => {
    if (busy.current || !open) return
    if (missing.length) {
      dispatch({ type: 'confirm' })
      return
    }
    if (def.risk?.(s.values) && !s.armed) {
      // c55: high-risk -> first click arms, auto-disarm after 4s
      dispatch({ type: 'confirm' })
      window.setTimeout(() => dispatch({ type: 'disarm' }), 4000)
      return
    }
    busy.current = true
    dispatch({ type: 'confirm' })
    try {
      const r = onRun ? await onRun(def.name, s.values) : { ok: false, message: tg('aa.noExecutor') }
      dispatch({ type: 'finish', ok: r.ok, message: r.message })
    } catch (err) {
      dispatch({ type: 'finish', ok: false, message: String((err as Error)?.message || err) })
    } finally {
      busy.current = false
    }
  }

  return (
    <div className="aa-card" data-testid="ai-action-card" data-action={def.name} data-phase={s.phase}>
      <div className="aa-head">
        <span className="aa-badge">{tg('aa.badge')}</span>
        <span className="aa-title">{tg(def.titleKey as MessageKey)}</span>
      </div>
      {s.showMissing && missing.length > 0 && open ? (
        <p className="aa-ask" role="alert" data-testid="ai-action-ask">
          {tg('aa.ask', { fields: missing.map((f) => tg(f.labelKey as MessageKey)).join(tg('aa.sep')) })}
        </p>
      ) : null}
      <div className="aa-fields">
        {visibleFields(def, s.values).map((f) => {
          const id = `aa-${def.name}-${f.key}`
          const bad = s.showMissing && missingKeys.has(f.key)
          return (
            <label key={f.key} className={`aa-row${bad ? ' is-missing' : ''}`} htmlFor={id}>
              <span className="aa-label">
                {tg(f.labelKey as MessageKey)}
                {f.required ? <span className="aa-req" aria-hidden="true">*</span> : null}
              </span>
              {f.type === 'select' ? (
                <Select
                  testId={id}
                  ariaLabel={tg(f.labelKey as MessageKey)}
                  value={s.values[f.key] ?? ''}
                  disabled={!open}
                  options={(f.options ?? []).map((o) => ({ value: o.value, label: tg(o.labelKey as MessageKey) }))}
                  onChange={(v) => dispatch({ type: 'edit', key: f.key, value: v })}
                />
              ) : (
                <input
                  id={id}
                  data-testid={id}
                  type={f.type === 'secret' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  autoComplete={f.type === 'secret' ? 'new-password' : 'off'}
                  disabled={!open}
                  aria-invalid={bad || undefined}
                  placeholder={f.type === 'secret' ? tg('aa.secretHint') : f.placeholder}
                  value={s.values[f.key] ?? ''}
                  onChange={(e) => dispatch({ type: 'edit', key: f.key, value: e.target.value })}
                />
              )}
            </label>
          )
        })}
      </div>
      {s.armed && open ? (
        <p className="aa-ask is-warn" role="alert" data-testid="ai-action-armed">{tg('aa.armedNote')}</p>
      ) : null}
      <div className="aa-foot">
        {s.phase === 'done' ? (
          <span className="aa-status is-ok" data-testid="ai-action-done">{s.message || tg('aa.done')}</span>
        ) : s.phase === 'cancelled' ? (
          <span className="aa-status" data-testid="ai-action-cancelled">{tg('aa.cancelled')}</span>
        ) : (
          <>
            {s.phase === 'error' ? (
              <span className="aa-status is-err">{s.message || tg('aa.failed')}</span>
            ) : (
              <span className="aa-note">{tg('aa.note')}</span>
            )}
            <Button variant="ghost" data-testid="ai-action-cancel" disabled={!open} onClick={() => dispatch({ type: 'cancel' })}>
              {tg('aa.cancel')}
            </Button>
            <Button variant={s.armed ? 'danger' : 'primary'} data-testid="ai-action-confirm" disabled={s.phase === 'running'} onClick={() => void runConfirmed()}>
              {s.phase === 'running' ? tg('aa.running') : s.armed ? tg('aa.confirmAgain') : tg('aa.confirm')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
