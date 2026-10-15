import { useCallback, useEffect, useMemo, useState } from 'react'
import { diffCounts, recordRollbackAudit, rollbackAllowed, rollbackClock, rollbackNeedsHostName, suggestCheckCommand, type SnapSource } from '@shared/snapshots'
import { tg, type MessageKey } from '../lib/i18n'
import { confirmDialog, askText } from '../lib/dialogs'
import { showToast } from '../lib/toast'
import Icon from './Icon'

type Row = {
  id: string
  profileId: string
  path: string
  at: number
  source: SnapSource
  bytes: number
  pinned: boolean
  hash: string
  stale?: boolean
}

type Props = {
  profileId: string
  hostLabel: string
  path: string
  level: string
  sessionId?: string
  onOpenFile?: (path: string) => void
  beforeWrite?: () => Promise<boolean>
}

function clock(at: number): string {
  return rollbackClock(at)
}

const SRC: Record<SnapSource, MessageKey> = {
  edit: 'w3.src.edit',
  sync: 'w3.src.sync',
  syncDelete: 'w3.src.syncDelete',
  rollback: 'w3.src.rollback',
  upload: 'w3.src.upload'
}

export default function FileHistoryTab({ profileId, hostLabel, path, level, sessionId, onOpenFile, beforeWrite }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [aId, setAId] = useState<string | 'current'>('current')
  const [bId, setBId] = useState<string | 'current'>('current')
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState<string | null>(null)
  const [currentState, setCurrentState] = useState<'ok' | 'unread' | 'missing'>('unread')
  const [busy, setBusy] = useState(false)
  const fileRows = rows.filter((r) => !path || r.path === path)
  const hostMode = !path

  const reload = useCallback(async () => {
    const list = (await window.aiss.snapshots.list({ profileId, path: path || undefined })) as Row[]
    setRows(Array.isArray(list) ? list : [])
  }, [path, profileId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!sessionId || !path || !window.aiss?.sftp?.readText) {
      setCurrentState('unread')
      return
    }
    void window.aiss.sftp
      .readText(sessionId, path, 2 * 1024 * 1024)
      .then((res) => {
        setCurrent(res.content ?? '')
        setCurrentState('ok')
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setCurrentState(/no such|not exist|ENOENT/i.test(msg) ? 'missing' : 'unread')
      })
  }, [path, sessionId])

  const read = async (id: string) => {
    if (texts[id] != null) return texts[id]!
    const res = await window.aiss.snapshots.read(id)
    if (!res.ok || res.content == null) return ''
    setTexts((cur) => ({ ...cur, [id]: res.content! }))
    return res.content
  }

  const textOf = async (id: string | 'current') => {
    if (id === 'current') return current ?? ''
    return read(id)
  }

  const [diff, setDiff] = useState<{ add: number; del: number; a: string; b: string } | null>(null)
  useEffect(() => {
    let stop = false
    void (async () => {
      const left = await textOf(aId)
      const right = await textOf(bId)
      if (!stop) setDiff({ ...diffCounts(left, right), a: left, b: right })
    })()
    return () => {
      stop = true
    }
  }, [aId, bId, current, texts])

  const selected = aId === 'current' ? null : fileRows.find((r) => r.id === aId) ?? null
  const canRollback = Boolean(selected) && rollbackAllowed(level) && Boolean(sessionId) && currentState !== 'unread'

  const rollback = async () => {
    if (!selected || !sessionId) return
    const content = await read(selected.id)
    const name = path.split('/').pop() || path
    const stats = diffCounts(current ?? '', content)
    const typed = rollbackNeedsHostName(level) ? await askText(tg('w3.typeHost', { host: hostLabel }), '') : hostLabel
    if (rollbackNeedsHostName(level) && (typed ?? '').trim() !== hostLabel) return
    const ok = await confirmDialog({
      title: tg('w3.confirmTitle', { name }),
      body: `${tg('w3.confirmBody', { time: clock(selected.at), host: hostLabel, path })}\n${tg('w3.confirmStats', { a: stats.add, d: stats.del })}\n${tg('w3.confirmSafety')}`,
      confirmText: currentState === 'missing' ? tg('w3.restore') : tg('w3.confirmBtn', { time: clock(selected.at) }),
      danger: level === 'production'
    })
    if (!ok) return
    const audit = (outcome: 'allowed' | 'blocked' | 'cancelled') =>
      recordRollbackAudit({
        path,
        at: selected.at,
        host: hostLabel,
        profileId,
        hostKey: profileId,
        outcome
      })
    if (beforeWrite && !(await beforeWrite())) {
      audit(level === 'readonly' ? 'blocked' : 'cancelled')
      return
    }
    setBusy(true)
    try {
      if (current != null) {
        await window.aiss.snapshots.put({ profileId, path, content: current, source: 'rollback', isText: true })
      }
      await window.aiss.sftp.writeText(sessionId, path, content)
      audit('allowed')
      showToast(tg('w3.rolledBack', { time: clock(selected.at) }))
      const check = suggestCheckCommand(path)
      if (check) showToast(check)
      setCurrent(content)
      await reload()
    } catch (e) {
      showToast(tg('w3.rollbackFail', { msg: e instanceof Error ? e.message : String(e) }), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, Row>()
    for (const row of rows) {
      const prev = map.get(row.path)
      if (!prev || row.at > prev.at) map.set(row.path, row)
    }
    return [...map.entries()]
  }, [rows])

  if (hostMode) {
    return (
      <div className="workspace-panel" data-testid="file-history-host">
        <div className="workspace-panel-toolbar">
          <h2 className="workspace-panel-title">{tg('w3.tabHost', { host: hostLabel })}</h2>
        </div>
        <div className="workspace-panel-body">
          <p className="l7-meta">{tg('w3.filesN', { n: groups.length, size: `${Math.ceil(rows.reduce((n, r) => n + r.bytes, 0) / 1024)} KB` })}</p>
          {groups.map(([file, row]) => (
            <button key={file} type="button" className="m2-row" onClick={() => onOpenFile?.(file)}>
              <span title={file}>{file}</span>
              <span className="l7-meta">{clock(row.at)} {tg(SRC[row.source])}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="workspace-panel w3-history" data-testid="file-history">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title" title={path}>{tg('w3.tabFile', { name: path.split('/').pop() || path })}</h2>
        <div className="workspace-panel-actions">
          <button type="button" className="primary" data-testid="w3-rollback" disabled={!canRollback || busy} title={!selected ? tg('w3.pickSnapshot') : !rollbackAllowed(level) ? tg('s4.rollbackDisabled') : undefined} onClick={() => void rollback()}>
            {busy ? tg('w3.rollingBack') : currentState === 'missing' ? tg('w3.restore') : tg('w3.rollback')}
          </button>
          <button type="button" title={tg('w3.openDir')} onClick={() => void window.aiss.snapshots.openDir()}>
            <Icon name="history" size={16} />
          </button>
        </div>
      </div>
      <div className="w3-split">
        <div className="w3-list" data-testid="w3-versions">
          <button type="button" className={aId === 'current' ? 'is-a' : ''} onClick={() => setAId('current')}>
            <span>{currentState === 'ok' ? tg('w3.current') : currentState === 'missing' ? tg('w3.currentMissing') : tg('w3.currentUnreadable')}</span>
          </button>
          {fileRows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`w3-ver${aId === row.id ? ' is-a' : ''}${bId === row.id ? ' is-b' : ''}`}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) setBId(row.id)
                else setAId(row.id)
              }}
            >
              <span>{clock(row.at)}</span>
              <span>{tg(SRC[row.source])}</span>
              {row.pinned ? <Icon name="check" size={14} /> : null}
            </button>
          ))}
          {fileRows.length === 0 ? (
            <p className="l7-muted" data-testid="w3-empty">{tg('w3.empty')}</p>
          ) : null}
        </div>
        <pre className="w3-diff" data-testid="w3-diff">{diff ? `+${diff.add} -${diff.del}\n${diff.b}` : ''}</pre>
      </div>
    </div>
  )
}
