import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RecentConnection } from '@shared/workspace-features'
import { dedupeRecent, loadRecentExpanded, relativeWhen, saveRecentExpanded } from '@shared/recent-sidebar'
import { DEMO_HOST, DEMO_USER, demoProfileLabel } from '@shared/demo-host'
import Icon, { Twist } from './Icon'
import { useI18n } from '../lib/i18n'
import { RECENT_CHANGED_EVENT } from '../lib/workspace-events'

type Props = {
  variant?: 'sidebar' | 'menu' | 'welcome'
  /** show at most this many rows (UX-08 terminal-area empty state) */
  limit?: number
  /** render nothing while there are no recent connections */
  hideWhenEmpty?: boolean
  onQuickConnect: (row: RecentConnection) => void
  /** Saved host identities (`user@host:port`) so a recent row can say Saved instead of cloning the tree. */
  savedKeys?: string[]
  /** UX-39b: a renamed demo host keeps its stored label. */
  demoRenamed?: boolean
}

function formatWhen(ts: number, locale: string): string {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(ts)
  } catch {
    return ''
  }
}

export default function RecentConnections({ variant = 'sidebar', limit, hideWhenEmpty, onQuickConnect, savedKeys = [], demoRenamed = false }: Props) {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState<RecentConnection[]>([])
  const [open, setOpen] = useState(() => (variant === 'sidebar' ? loadRecentExpanded() : true))

  const reload = useCallback(() => {
    const api = window.aiss?.workspace?.recent
    if (!api) return
    void api
      .list()
      .then((list) => setRows(Array.isArray(list) ? list : []))
      .catch(() => {
        /* ignore */
      })
  }, [])

  useEffect(() => {
    reload()
    window.addEventListener(RECENT_CHANGED_EVENT, reload)
    return () => window.removeEventListener(RECENT_CHANGED_EVENT, reload)
  }, [reload])

  const pin = async (row: RecentConnection) => {
    const next = await window.aiss.workspace.recent.pin(row.id, !row.pinned)
    setRows(next)
  }

  const remove = async (row: RecentConnection) => {
    const next = await window.aiss.workspace.recent.remove(row.id)
    setRows(next)
  }

  const shown = useMemo(() => dedupeRecent(rows, limit ?? (variant === 'sidebar' ? 5 : rows.length)), [limit, rows, variant])
  const saved = useMemo(() => new Set(savedKeys.map((k) => k.toLowerCase())), [savedKeys])
  if (hideWhenEmpty && rows.length === 0) return null
  const collapsed = variant === 'sidebar' && !open
  return (
    <section className={`recent-connections recent-connections--${variant}${collapsed ? ' is-collapsed' : ''}`} data-testid="recent-connections">
      <header className="recent-connections-header">
        {variant === 'sidebar' ? (
          <button
            type="button"
            className="recent-connections-toggle"
            aria-expanded={open}
            onClick={() => {
              const next = !open
              setOpen(next)
              saveRecentExpanded(next)
            }}
          >
            <span aria-hidden><Twist open={open} size={12} /></span>
            <h3>
              {t('recent.title')} ({shown.length})
            </h3>
          </button>
        ) : (
          <h3>{t('recent.title')}</h3>
        )}
      </header>
      {collapsed ? null : rows.length === 0 ? (
        <p className="recent-connections-empty">{t('recent.emptyHint')}</p>
      ) : (
        <ul className="recent-connections-list">
          {shown.map((row) => {
            const title = row.host === DEMO_HOST && row.username === DEMO_USER && !demoRenamed
              ? demoProfileLabel(locale === 'en' ? 'en' : 'zh-CN')
              : row.label?.trim() || `${row.username}@${row.host}`
            const ident = `${row.username}@${row.host}:${row.port || 22}`.toLowerCase()
            const when = relativeWhen(row.lastConnectedAt || 0)
            const whenText =
              variant === 'sidebar'
                ? when.kind === 'now'
                  ? t('recent.justNow')
                  : when.kind === 'min'
                    ? t('recent.minAgo', { n: when.n })
                    : when.kind === 'hour'
                      ? t('recent.hourAgo', { n: when.n })
                      : when.kind === 'yesterday'
                        ? t('recent.yesterday')
                        : formatWhen(row.lastConnectedAt || 0, locale)
                : formatWhen(row.lastConnectedAt || 0, locale)
            return (
              <li key={row.id} className={row.pinned ? 'is-pinned' : ''}>
                <button
                  type="button"
                  className="recent-connections-main"
                  title={`${row.username}@${row.host}:${row.port || 22}${row.jump?.length ? ' -J ' + row.jump.map((h) => (h.username ? h.username + '@' : '') + h.host + (h.port !== 22 ? ':' + h.port : '')).join(',') : ''}${row.quick && !saved.has(ident) ? '\n' + t('d13c.tempTip') : ''}`}
                  onClick={() => onQuickConnect(row)}
                >
                  <span className="recent-connections-name">{title}</span>
                  <span className="recent-connections-meta">
                    {saved.has(ident) ? <span className="recent-connections-badge">{t('recent.saved')}</span> : row.quick ? <span className="recent-connections-badge is-quick" data-testid="recent-quick-badge">{t('d13c.temp')}</span> : null}
                    {whenText}
                  </span>
                </button>
                <button
                  type="button"
                  className={`recent-connections-icon${row.pinned ? ' is-on' : ''}`}
                  title={row.pinned ? t('recent.unpin') : t('recent.pin')}
                  aria-label={row.pinned ? t('recent.unpin') : t('recent.pin')}
                  onClick={() => void pin(row)}
                >
                  <Icon name="pin" size={14} />
                </button>
                <button
                  type="button"
                  className="recent-connections-icon"
                  title={t('recent.remove')}
                  aria-label={t('recent.remove')}
                  onClick={() => void remove(row)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
