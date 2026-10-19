import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n, type MessageKey } from '../lib/i18n'
import { placeTourCard, type Box } from '@shared/tour-place'

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
  const [skipped, setSkipped] = useState<number[]>([])
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(180)

  useEffect(() => {
    if (open) {
      setIdx(0)
      setDir(1)
      setSkipped([])
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
      setSkipped((s) => (s.includes(idx) ? s : [...s, idx]))
      const next = idx + dir
      if (next < 0 || next >= TOUR_STEPS.length) finish()
      else setIdx(next)
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, idx, dir, ensureAiVisible, finish])

  const go = useCallback(
    (delta: 1 | -1) => {
      setDir(delta)
      setIdx((i) => {
        let next = i + delta
        while (next >= 0 && next < TOUR_STEPS.length && skipped.includes(next)) next += delta
        if (next < 0 || next >= TOUR_STEPS.length) {
          if (delta > 0) finish()
          return i
        }
        return next
      })
    },
    [finish, skipped]
  )

  useEffect(() => {
    if (!open) return
    let frame = 0
    const place = () => {
      const step = TOUR_STEPS[idx]
      const el = step ? findTarget(step) : null
      if (el) setRect(el.getBoundingClientRect())
    }
    const onResize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    const onKey = (e: KeyboardEvent) => {
      const card = cardRef.current
      if (e.key === 'Tab' && card) {
        const items = [...card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter((el) => !el.hasAttribute('disabled'))
        if (items.length) {
          e.preventDefault()
          e.stopPropagation()
          const i = items.indexOf(document.activeElement as HTMLElement)
          const next = e.shiftKey ? items[(i <= 0 ? items.length : i) - 1]! : items[(i + 1) % items.length]!
          next.focus()
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finish()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        go(1)
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        go(-1)
      }
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey, true)
    cardRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, idx, go])

  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight
    if (h && Math.abs(h - cardH) > 2) setCardH(h)
  })

  if (!open) return null
  const step = TOUR_STEPS[idx]!
  const visible = TOUR_STEPS.map((_, i) => i).filter((i) => !skipped.includes(i))
  const posIn = Math.max(1, visible.indexOf(idx) + 1)
  const total = Math.max(1, visible.length)
  const last = idx === visible[visible.length - 1]
  const first = idx === visible[0]
  const pad = 6
  const bubbleW = 300
  const avoids: Box[] = [...document.querySelectorAll<HTMLElement>('[data-tour-avoid]')].map((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })
  const placed = rect
    ? placeTourCard({
        target: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        avoids,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        card: { width: bubbleW, height: cardH }
      })
    : { side: 'bottom' as const, left: Math.max(16, (window.innerWidth - bubbleW) / 2), top: Math.max(72, window.innerHeight * 0.2) }

  return (
    <div className="tour-root" data-testid="welcome-tour" role="dialog" aria-modal="true" aria-label={t('g2.title')}>
      {rect ? (
        <div
          className="tour-highlight"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : null}
      <div
        ref={cardRef}
        className={`tour-bubble tour-bubble--${placed.side}`}
        data-testid="tour-card"
        data-side={placed.side}
        style={{ width: bubbleW, left: placed.left, top: placed.top }}
      >
        <button type="button" className="tour-skip" data-testid="tour-skip" onClick={finish}>
          {t('g2.skip')}
        </button>
        <div className="tour-step">
          {t('ux38.step', { i: posIn, n: total })}
        </div>
        <div className="tour-title" data-testid="tour-title">
          {t(step.title)}
        </div>
        <div className="tour-body">{t(step.body)}</div>
        <div className="tour-hint">{t('ux38.keys')}</div>
        <div className="tour-actions">
          {first ? null : (
            <button
              type="button"
              data-testid="tour-back"
              onClick={() => go(-1)}
            >
              {t('g2.back')}
            </button>
          )}
          <button type="button" className="primary" data-testid="tour-next" onClick={() => (last ? finish() : go(1))}>
            {last ? t('g2.start') : t('g2.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
