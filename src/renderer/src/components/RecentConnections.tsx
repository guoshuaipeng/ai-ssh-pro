import { useCallback, useEffect, useState } from 'react'
import type { RecentConnection } from '@shared/workspace-features'
import { useI18n } from '../lib/i18n'
import { RECENT_CHANGED_EVENT } from '../lib/workspace-events'

type Props = {
  variant?: 'sidebar' | 'menu' | 'welcome'
  /** show at most this many rows (UX-08 terminal-area empty state) */
  limit?: number
  /** render nothing while there are no recent connections */
  hideWhenEmpty?: boolean
  onQuickConnect: (row: RecentConnection) => void
}

function relativeWhen(ts: number, t: (key: 'recent.justNow' | 'recent.minutesAgo' | 'recent.hoursAgo' | 'recent.daysAgo', vars?: Record<string, string | number>) => string): string {
  if (!ts) return ''
  const min = Math.round((Date.now() - ts) / 60000)
  if (min < 1) return t('recent.justNow')
  if (min < 60) return t('recent.minutesAgo', { n: min })
  const hr = Math.round(min / 60)
  if (hr < 48) return t('recent.hoursAgo', { n: hr })
  return t('recent.daysAgo', { n: Math.round(hr / 24) })
}

export default function RecentConnections({ variant = 'sidebar', limit, hideWhenEmpty, onQuickConnect }: Props) {
  const { t } = useI18n()
  const [rows, setRows] = useState<RecentConnection[]>([])

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

  if (hideWhenEmpty && rows.length === 0) return null
  return (
    <section className={`recent-connections recent-connections--${variant}`}>
      <header className="recent-connections-header">
        <h3>{t('recent.title')}</h3>
      </header>
      {rows.length === 0 ? (
        <p className="recent-connections-empty">{t('recent.empty')}</p>
      ) : (
        <ul className="recent-connections-list">
          {(limit ? rows.slice(0, limit) : rows).map((row) => {
            const title = row.label?.trim() || `${row.username}@${row.host}`
            const when = row.lastConnectedAt ? relativeWhen(row.lastConnectedAt, t) : ''
            const addr = `${row.username}@${row.host}${row.port && row.port !== 22 ? `:${row.port}` : ''}`
            return (
              <li key={row.id} className={row.pinned ? 'is-pinned' : ''}>
                <button
                  type="button"
                  className="recent-connections-main"
                  title={addr}
                  onClick={() => onQuickConnect(row)}
                >
                  <span className="recent-connections-name">
                    {row.pinned ? <span className="recent-connections-badge">{t('recent.bookmark')}</span> : null}
                    {title}
                    {when ? <span className="recent-connections-when"> · {when}</span> : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="recent-connections-icon"
                  title={row.pinned ? t('recent.unpin') : t('recent.pin')}
                  aria-label={row.pinned ? t('recent.unpin') : t('recent.pin')}
                  onClick={() => void pin(row)}
                >
                  {row.pinned ? '★' : '☆'}
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
