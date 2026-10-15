import { useEffect, useMemo, useRef, useState } from 'react'
import type { SavedSessionProfile } from '@shared/ipc'
import { hostStatusLevel, type HostProbeResult } from '@shared/host-status'
import { useI18n } from '../lib/i18n'
import EmptyState from './EmptyState'
import Icon from './Icon'

type Props = {
  open: boolean
  /** feature name shown in "Pick a host to open {feature}" */
  feature: string
  profiles: SavedSessionProfile[]
  /** recently used first: host|port|user keys from the recent list */
  recentKeys: string[]
  statusById?: Record<string, HostProbeResult | null | undefined>
  groupOf?: (p: SavedSessionProfile) => string | undefined
  /** connect; resolves to an error message, or null on success (the caller then opens the feature) */
  onPick: (p: SavedSessionProfile) => Promise<string | null>
  onNewConnection: () => void
  onClose: () => void
}

const keyOf = (p: { host: string; port?: number; username: string }) => `${p.host}|${p.port || 22}|${p.username}`.toLowerCase()

/** UX-09: a session-needing feature was opened without a connection → pick a host, auto-connect, then open it. */
export default function HostPicker({ open, feature, profiles, recentKeys, statusById, groupOf, onPick, onNewConnection, onClose }: Props) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setSel(0)
    setBusyId(null)
    setErrors({})
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  const list = useMemo(() => {
    const rank = (p: SavedSessionProfile) => {
      const i = recentKeys.indexOf(keyOf(p))
      return i < 0 ? 1e6 : i
    }
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return profiles
      .filter((p) => {
        const hay = `${p.label} ${p.username}@${p.host} ${(p.tags ?? []).join(' ')}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
  }, [profiles, recentKeys, q])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyId) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busyId, onClose])

  if (!open) return null
  const pick = async (p?: SavedSessionProfile) => {
    if (!p || busyId) return
    setBusyId(p.id)
    setErrors((e) => {
      const n = { ...e }
      delete n[p.id]
      return n
    })
    const err = await onPick(p)
    setBusyId(null)
    if (err) setErrors((e) => ({ ...e, [p.id]: err }))
  }

  return (
    <div className="cmdp-backdrop" role="presentation" onMouseDown={() => !busyId && onClose()}>
      <div className="cmdp host-picker" role="dialog" aria-label={t('ux09.title', { feature })} data-testid="host-picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="host-picker-title">{t('ux09.title', { feature })}</div>
        {profiles.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="monitor" size={32} strokeWidth={1.5} />}
            title={t('ux08.sidebarTitle')}
            desc={t('pf4.hostsDesc')}
            primary={{
              label: t('pf1.new'),
              onClick: () => {
                onClose()
                onNewConnection()
              }
            }}
          />
        ) : (
          <>
            <input
              ref={inputRef}
              className="cmdp-input"
              placeholder={t('ux09.search')}
              aria-label={t('ux09.search')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSel((s) => Math.min(list.length - 1, s + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSel((s) => Math.max(0, s - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  void pick(list[sel])
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!busyId) onClose()
                }
              }}
            />
            <div className="cmdp-list" role="listbox">
              {list.length === 0 ? <div className="cmdp-empty">{t('ux09.empty')}</div> : null}
              {list.map((p, i) => (
                <div key={p.id} className={`cmdp-item host-picker-item${i === sel ? ' is-active' : ''}`} onMouseEnter={() => setSel(i)}>
                  <button type="button" role="option" aria-selected={i === sel} className="host-picker-main" onClick={() => void pick(p)}>
                    {(() => {
                      const st = statusById ? (statusById[p.id] ?? null) : undefined
                      const level = st === undefined ? null : hostStatusLevel(st ?? undefined)
                      return level ? <span className={`host-status-dot host-status-dot--${level}`} data-status={level} data-testid="host-picker-status" /> : null
                    })()}
                    <span className="cmdp-label">{p.label}</span>
                    <span className="cmdp-group">
                      {groupOf?.(p) ? `${groupOf(p)} · ` : ''}
                      {p.demo ? 'DEMO' : `${p.username}@${p.host}`}
                    </span>
                    {statusById?.[p.id]?.latencyMs != null ? <span className="host-status-ms">{statusById[p.id]!.latencyMs} ms</span> : null}
                    {busyId === p.id ? <span className="ai-spinner" aria-label={t('ux09.connecting')} /> : null}
                  </button>
                  {errors[p.id] ? (
                    <div className="host-picker-error" role="alert">
                      <span>{errors[p.id]}</span>
                      <button type="button" onClick={() => void pick(p)}>
                        {t('upd.retry')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="cmdp-foot">{t('ux09.hint')}</div>
          </>
        )}
      </div>
    </div>
  )
}
