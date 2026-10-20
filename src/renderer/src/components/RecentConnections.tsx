import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RecentConnection } from '@shared/workspace-features'
import { dedupeRecent, loadRecentExpanded, relativeWhen, saveRecentExpanded } from '@shared/recent-sidebar'
import { DEMO_HOST, DEMO_USER, demoProfileLabel } from '@shared/demo-host'
import Icon, { Twist } from './Icon'
import { useI18n } from '../lib/i18n'
import { RECENT_CHANGED_EVENT } from '../lib/workspace-events'
import { filterRecent } from '@shared/recent-quick'
import { CONNECT_FAIL_EVENT, connectFailKey, getConnectFail } from '../lib/connect-fail-store'

/** D21: show the filter once Recent is longer than this */
export const RECENT_FILTER_MIN = 5

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
  /** D21: open the connection editor pre-filled from this row */
  onSaveAsHost?: (row: RecentConnection) => void
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

export default function RecentConnections({ variant = 'sidebar', limit, hideWhenEmpty, onQuickConnect, savedKeys = [], demoRenamed = false, onSaveAsHost }: Props) {
  const [filter, setFilter] = useState('')
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
  // D88: repaint failure dots
  const [, setFailTick] = useState(0)
  useEffect(() => {
    const bump = () => setFailTick((n) => n + 1)
    window.addEventListener(CONNECT_FAIL_EVENT, bump)
    return () => window.removeEventListener(CONNECT_FAIL_EVENT, bump)
  }, [])

  const pin = async (row: RecentConnection) => {
    const next = await window.aiss.workspace.recent.pin(row.id, !row.pinned)
    setRows(next)
  }

  const remove = async (row: RecentConnection) => {
    const next = await window.aiss.workspace.recent.remove(row.id)
    setRows(next)
  }

  const unique = useMemo(() => dedupeRecent(rows, rows.length), [rows])
  const shown = useMemo(
    () => (filter.trim() ? filterRecent(unique, filter).slice(0, 30) : dedupeRecent(rows, limit ?? (variant === 'sidebar' ? 5 : rows.length))),
    [filter, unique, limit, rows, variant]
  )
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
      {!collapsed && unique.length > RECENT_FILTER_MIN ? (
        <input
          type="search"
          className="recent-connections-filter"
          data-testid="recent-filter"
          value={filter}
          placeholder={t('d21.filter', { n: unique.length })}
          aria-label={t('d21.filterLabel')}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && filter) { e.stopPropagation(); setFilter('') } }}
        />
      ) : null}
      {!collapsed && filter.trim() && shown.length === 0 ? <p className="recent-connections-empty">{t('d21.none')}</p> : null}
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
                  <span className="recent-connections-name">
                    {(() => {
                      const fail = getConnectFail(connectFailKey(row.username, row.host, row.port))
                      return fail ? (
                        <span
                          className="recent-fail-dot"
                          data-testid="recent-fail-dot"
                          role="img"
                          aria-label={t('d88.failed', { reason: fail.reason })}
                          title={t('d88.failed', { reason: fail.reason })}
                        />
                      ) : null
                    })()}
                    {title}
                  </span>
                  <span className="recent-connections-meta">
                    {saved.has(ident) ? <span className="recent-connections-badge">{t('recent.saved')}</span> : row.quick ? <span className="recent-connections-badge is-quick" data-testid="recent-quick-badge">{t('d13c.temp')}</span> : null}
                    {whenText}
                  </span>
                </button>
                {onSaveAsHost && !saved.has(ident) && !(row.host === DEMO_HOST && row.username === DEMO_USER) ? (
                  <button
                    type="button"
                    className="recent-connections-icon"
                    data-testid="recent-save-host"
                    title={t('d21.save')}
                    aria-label={t('d21.save')}
                    onClick={() => onSaveAsHost(row)}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                ) : null}
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
