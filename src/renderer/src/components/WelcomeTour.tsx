import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useI18n, type MessageKey } from '../lib/i18n'

export const TOUR_DONE_KEY = 'aiss.tourDone'

type Step = { selectors: string[]; title: MessageKey; body: MessageKey; prepare?: 'ai' }

/** G2: five highlighted steps; Skip / Esc ends it, Help → Welcome tour replays it. */
export const TOUR_STEPS: ReadonlyArray<Step> = [
  { selectors: ['[data-tour="new-connection"]', '[data-tool="connection"]'], title: 'g2.s1.title', body: 'g2.s1.body' },
  { selectors: ['[data-tour="ops"]'], title: 'g2.s2.title', body: 'g2.s2.body' },
  { selectors: ['[data-tool="commandPalette"]'], title: 'g2.s3.title', body: 'g2.s3.body' },
  { selectors: ['.ai-panel-shell'], title: 'g2.s4.title', body: 'g2.s4.body', prepare: 'ai' },
  { selectors: ['aside .profile-row--host', 'aside.sidebar'], title: 'g2.s5.title', body: 'g2.s5.body' }
]

function findTarget(step: Step): HTMLElement | null {
  for (const sel of step.selectors) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el && el.getClientRects().length > 0) return el
  }
  return null
}

type Props = { open: boolean; onClose: () => void; ensureAiVisible: () => void }

export default function WelcomeTour({ open, onClose, ensureAiVisible }: Props) {
  const { t } = useI18n()
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [dir, setDir] = useState<1 | -1>(1)

  useEffect(() => {
    if (open) {
      setIdx(0)
      setDir(1)
    }
  }, [open])

  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1')
    } catch {
      /* ignore */
    }
    onClose()
  }, [onClose])

  // locate the target; expand the AI panel when needed; skip steps whose target cannot be shown
  useLayoutEffect(() => {
    if (!open) return
    const step = TOUR_STEPS[idx]
    if (!step) return
    let cancelled = false
    const locate = () => {
      const el = findTarget(step)
      if (el) {
        setRect(el.getBoundingClientRect())
        return true
      }
      return false
    }
    if (locate()) return
    if (step.prepare === 'ai') ensureAiVisible()
    const timer = window.setTimeout(() => {
      if (cancelled || locate()) return
      const next = idx + dir
      if (next < 0 || next >= TOUR_STEPS.length) finish()
      else setIdx(next)
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, idx, dir, ensureAiVisible, finish])

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      const step = TOUR_STEPS[idx]
      const el = step ? findTarget(step) : null
      if (el) setRect(el.getBoundingClientRect())
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finish()
      }
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, idx, finish])

  if (!open || !rect) return null
  const step = TOUR_STEPS[idx]!
  const last = idx === TOUR_STEPS.length - 1
  const pad = 6
  const vw = window.innerWidth
  const vh = window.innerHeight
  const bubbleW = 320
  const below = rect.bottom + 160 < vh
  const left = Math.max(12, Math.min(vw - bubbleW - 12, rect.left + rect.width / 2 - bubbleW / 2))
  const top = below ? rect.bottom + pad + 10 : Math.max(12, rect.top - pad - 10 - 150)
  // tall targets (sidebar, AI panel): put the bubble beside them
  const tall = rect.height > vh * 0.5
  const sideLeft = rect.left > vw / 2 ? rect.left - bubbleW - 16 : rect.right + 16
  const pos = tall ? { left: Math.max(12, Math.min(vw - bubbleW - 12, sideLeft)), top: Math.max(12, rect.top + 40) } : { left, top }

  return (
    <div className="tour-root" data-testid="welcome-tour" role="dialog" aria-modal="true" aria-label={t('g2.title')}>
      <div
        className="tour-highlight"
        style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
      <div className="tour-bubble" style={{ width: bubbleW, ...pos }}>
        <button type="button" className="tour-skip" data-testid="tour-skip" onClick={finish}>
          {t('g2.skip')}
        </button>
        <div className="tour-step">
          {idx + 1} / {TOUR_STEPS.length}
        </div>
        <div className="tour-title" data-testid="tour-title">
          {t(step.title)}
        </div>
        <div className="tour-body">{t(step.body)}</div>
        <div className="tour-actions">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => {
              setDir(-1)
              setIdx((i) => Math.max(0, i - 1))
            }}
          >
            {t('g2.back')}
          </button>
          <button
            type="button"
            className="primary"
            data-testid="tour-next"
            onClick={() => {
              if (last) finish()
              else {
                setDir(1)
                setIdx((i) => i + 1)
              }
            }}
          >
            {last ? t('g2.start') : t('g2.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
