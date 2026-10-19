import { useEffect, useMemo, useRef, useState } from 'react'
import type { SftpListEntry, SftpListResult } from '@shared/ipc'
import {
  DEFAULT_EXCLUDES,
  countKinds,
  diffTrees,
  isProductionHost,
  matchExclude,
  parseExcludeText,
  relativePath,
  selectedBytes,
  type CompareMode,
  type SyncKind,
  type SyncNode,
  type SyncProfile,
  type SyncRow
} from '@shared/folder-sync'
import { formatBytes } from '@shared/sftp-queue'
import { changeCount, shouldPinSyncPreview } from '@shared/file-workflow'
import { tg } from '../lib/i18n'
import { askText } from '../lib/dialogs'
import Modal from './Modal'
import EmptyState from './EmptyState'
import Icon from './Icon'
import { EMPTY_ICON_SIZE_COMPACT, EMPTY_ICON_STROKE } from './emptyIcons'

type Props = {
  open: boolean
  hostLabel: string
  hostName: string
  hostKey: string
  tags?: string[]
  localPath: string
  remotePath: string
  initialDirection?: 'upload' | 'download'
  profile?: SyncProfile | null
  onClose: () => void
  listLocal: (dir: string) => Promise<SftpListResult>
  listRemote: (dir: string) => Promise<SftpListResult>
  hashLocal?: (path: string) => Promise<string>
  hashRemote?: (path: string) => Promise<string>
  onRun: (plan: {
    direction: 'upload' | 'download'
    localRoot: string
    remoteRoot: string
    rows: SyncRow[]
    deleteExtra: boolean
  }) => void
  onSaveProfile: (profile: SyncProfile) => void
  onPin?: (plan: {
    direction: 'upload' | 'download'
    localRoot: string
    remoteRoot: string
    rows: SyncRow[]
    deleteExtra: boolean
  }) => void
}

async function walk(
  root: string,
  list: (dir: string) => Promise<SftpListResult>,
  excludes: string[],
  onCount: (n: number) => void,
  signal: { cancelled: boolean }
): Promise<SyncNode[]> {
  const out: SyncNode[] = []
  const stack = [root]
  const seen = new Set<string>()
  while (stack.length) {
    if (signal.cancelled) return out
    const dir = stack.pop()!
    if (seen.has(dir)) continue
    seen.add(dir)
    let res: SftpListResult
    try {
      res = await list(dir)
    } catch {
      continue
    }
    for (const e of res.entries) {
      const rel = relativePath(root, e.path)
      if (!rel || matchExclude(rel, excludes)) continue
      if (e.isDirectory) {
        if (out.length + stack.length < 2000) stack.push(e.path)
        continue
      }
      out.push({ rel, size: e.size, mtime: e.modifyTime || 0 })
      if (out.length >= 2000) return out
      if (out.length % 20 === 0) onCount(out.length)
    }
  }
  onCount(out.length)
  return out
}

export default function FolderSyncModal({
  open,
  hostLabel,
  hostName,
  hostKey,
  tags,
  localPath,
  remotePath,
  initialDirection = 'upload',
  profile,
  onClose,
  listLocal,
  listRemote,
  hashLocal,
  hashRemote,
  onRun,
  onSaveProfile,
  onPin
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [direction, setDirection] = useState<'upload' | 'download'>(initialDirection)
  const [localRoot, setLocalRoot] = useState(localPath)
  const [remoteRoot, setRemoteRoot] = useState(remotePath)
  const [compare, setCompare] = useState<CompareMode>('size-mtime')
  const [excludeText, setExcludeText] = useState(DEFAULT_EXCLUDES.join('\n'))
  const [deleteExtra, setDeleteExtra] = useState(false)
  const [rows, setRows] = useState<SyncRow[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [collapsed, setCollapsed] = useState<Record<SyncKind, boolean>>({ new: false, changed: false, deleted: false, same: true })
  const [comparing, setComparing] = useState(false)
  const [compared, setCompared] = useState(0)
  const [running, setRunning] = useState(false)
  const [saveHint, setSaveHint] = useState(false)
  const cancelRef = useRef({ cancelled: false })

  useEffect(() => {
    if (!open) return
    setStep(1)
    setRunning(false)
    setSaveHint(false)
    setRows([])
    setDirection(profile?.direction ?? initialDirection)
    setLocalRoot(profile?.localPath || localPath)
    setRemoteRoot(profile?.remotePath || remotePath)
    setCompare(profile?.compare ?? 'size-mtime')
    setExcludeText((profile?.excludes ?? DEFAULT_EXCLUDES).join('\n'))
    setDeleteExtra(Boolean(profile?.deleteExtra))
  }, [open, localPath, remotePath, initialDirection, profile])

  const counts = useMemo(() => countKinds(rows), [rows])
  const selected = useMemo(() => new Set(Object.keys(picked).filter((k) => picked[k])), [picked])
  const bytes = selectedBytes(rows, selected)
  const targetLabel = direction === 'upload' ? `${hostLabel}:${remoteRoot}` : localRoot
  const prod = isProductionHost(`${hostLabel} ${hostName}`, tags)
  const deleteCount = deleteExtra ? [...selected].filter((rel) => rows.find((r) => r.rel === rel && r.kind === 'deleted')).length : 0
  const copyCount = rows.filter((r) => (r.kind === 'new' || r.kind === 'changed') && picked[r.rel]).length

  const runCompare = async () => {
    cancelRef.current = { cancelled: false }
    setComparing(true)
    setCompared(0)
    setStep(2)
    const excludes = parseExcludeText(excludeText)
    const signal = cancelRef.current
    try {
      const sourceList = direction === 'upload' ? listLocal : listRemote
      const targetList = direction === 'upload' ? listRemote : listLocal
      const sourceRoot = direction === 'upload' ? localRoot : remoteRoot
      const targetRoot = direction === 'upload' ? remoteRoot : localRoot
      const [src, dst] = await Promise.all([
        walk(sourceRoot, sourceList, excludes, setCompared, signal),
        walk(targetRoot, targetList, excludes, setCompared, signal)
      ])
      if (signal.cancelled) return
      let next = diffTrees(src, dst, compare)
      if (compare === 'checksum' && hashLocal && hashRemote) {
        const interesting = next.filter((r) => r.kind === 'changed' || r.kind === 'same').slice(0, 80)
        for (const row of interesting) {
          if (signal.cancelled) return
          const localFile = localRoot.replace(/[\\/]+$/, '') + '/' + row.rel
          const remoteFile = remoteRoot.replace(/\/+$/, '') + '/' + row.rel
          try {
            const [a, b] = await Promise.all([hashLocal(localFile), hashRemote(remoteFile)])
            const srcNode = src.find((n) => n.rel === row.rel)
            const dstNode = dst.find((n) => n.rel === row.rel)
            if (srcNode) srcNode.checksum = a
            if (dstNode) dstNode.checksum = b
          } catch {
            /* keep size+mtime result for this file */
          }
        }
        next = diffTrees(src, dst, 'checksum')
      }
      setRows(next)
      const init: Record<string, boolean> = {}
      for (const r of next) if (r.kind !== 'same') init[r.rel] = true
      setPicked(init)
      if (onPin && shouldPinSyncPreview(changeCount(next), false)) {
        onPin({ direction, localRoot, remoteRoot, rows: next.filter((r) => r.kind !== 'same'), deleteExtra })
      }
    } finally {
      setComparing(false)
    }
  }

  const pinPlan = () => {
    const chosen = rows.filter((r) => picked[r.rel] && r.kind !== 'same')
    onPin?.({ direction, localRoot, remoteRoot, rows: chosen, deleteExtra })
  }

  const confirmRun = async () => {
    const chosen = rows.filter((r) => picked[r.rel] && r.kind !== 'same')
    const deleting = deleteExtra ? chosen.filter((r) => r.kind === 'deleted') : []
    if (prod && deleting.length > 0) {
      const typed = await askText(tg('d2.typeHost', { host: hostName }), '')
      if ((typed ?? '').trim() !== hostName) return
    }
    setRunning(true)
    setStep(3)
    onRun({
      direction,
      localRoot,
      remoteRoot,
      rows: chosen,
      deleteExtra
    })
  }

  const saveProfile = async () => {
    const name = await askText(tg('d2.saveAs'), '')
    if (!name?.trim()) return
    onSaveProfile({
      id: profile?.id || `sync-${Date.now()}`,
      name: name.trim(),
      direction,
      localPath: localRoot,
      remotePath: remoteRoot,
      hostKey,
      compare,
      excludes: parseExcludeText(excludeText),
      deleteExtra
    })
    setSaveHint(true)
  }

  const groups: SyncKind[] = ['new', 'changed', 'deleted', 'same']
  const kindLabel: Record<SyncKind, string> = {
    new: tg('d2.new'),
    changed: tg('d2.changed'),
    deleted: tg('d2.deleted'),
    same: tg('d2.same')
  }

  return (
    <Modal
      open={open}
      title={tg('d2.title')}
      onClose={onClose}
      width={720}
      testId="folder-sync"
      footer={
        step === 1 ? (
          <>
            <button type="button" onClick={onClose}>
              {tg('dlg.cancel')}
            </button>
            <button type="button" className="primary" onClick={() => void runCompare()}>
              {tg('d2.preview')}
            </button>
          </>
        ) : step === 2 ? (
          <>
            <button type="button" onClick={() => setStep(1)} disabled={comparing}>
              {tg('g2.back')}
            </button>
            {onPin ? (
              <button type="button" onClick={pinPlan} disabled={comparing}>
                {tg('m2.pinPreview')}
              </button>
            ) : null}
            <button
              type="button"
              className={deleteCount > 0 ? 'primary danger' : 'primary'}
              disabled={comparing || (copyCount === 0 && deleteCount === 0)}
              onClick={() => void confirmRun()}
            >
              {deleteCount > 0 ? tg('d2.syncDelete', { d: deleteCount }) : tg('d2.syncN', { n: copyCount, target: targetLabel })}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => void saveProfile()}>
              {tg('d2.saveAs')}
            </button>
            <button type="button" className="primary" onClick={onClose}>
              {tg('d2.background')}
            </button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="sync-step" data-testid="sync-step-setup">
          <div className="sync-dirs">
            <label>
              {tg('d2.source')}
              <input value={direction === 'upload' ? localRoot : remoteRoot} onChange={(e) => (direction === 'upload' ? setLocalRoot(e.target.value) : setRemoteRoot(e.target.value))} />
            </label>
            <button type="button" className="sync-swap" title={tg('d2.swap')} onClick={() => setDirection((d) => (d === 'upload' ? 'download' : 'upload'))}>
              ⇄
            </button>
            <label>
              {tg('d2.target')}
              <input value={direction === 'upload' ? remoteRoot : localRoot} onChange={(e) => (direction === 'upload' ? setRemoteRoot(e.target.value) : setLocalRoot(e.target.value))} />
            </label>
          </div>
          <label className="sync-field">
            {tg('d2.compare')}
            <select value={compare} onChange={(e) => setCompare(e.target.value as CompareMode)}>
              <option value="size-mtime">{tg('d2.compareFast')}</option>
              <option value="checksum">{tg('d2.compareHash')}</option>
            </select>
          </label>
          <label className="sync-field">
            {tg('d2.exclude')}
            <textarea rows={3} value={excludeText} onChange={(e) => setExcludeText(e.target.value)} />
          </label>
          <label className="sync-check">
            <input type="checkbox" checked={deleteExtra} onChange={(e) => setDeleteExtra(e.target.checked)} />
            {tg('d2.deleteExtra')}
          </label>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="sync-step" data-testid="sync-step-preview">
          {comparing ? (
            <div className="sync-comparing">
              {tg('d2.comparing', { n: compared })}
              <button
                type="button"
                onClick={() => {
                  cancelRef.current.cancelled = true
                  setComparing(false)
                }}
              >
                {tg('dlg.cancel')}
              </button>
            </div>
          ) : rows.length === 0 || (counts.new === 0 && counts.changed === 0 && counts.deleted === 0) ? (
            <EmptyState compact icon={<Icon name="check" size={EMPTY_ICON_SIZE_COMPACT} strokeWidth={EMPTY_ICON_STROKE} />} title={tg('d2.inSync')} testId="sync-empty" primary={{ label: tg('common.close'), onClick: onClose }} />
          ) : (
            <>
              <div className="sync-summary">
                {groups.map((k) => (
                  <button key={k} type="button" className={collapsed[k] ? '' : 'is-on'} onClick={() => setCollapsed((c) => ({ ...c, [k]: !c[k] }))}>
                    {kindLabel[k]} {counts[k]}
                  </button>
                ))}
                <span className="sync-bytes">{formatBytes(bytes)}</span>
              </div>
              {deleteCount > 0 ? (
                <div className="sync-delete-warn" data-testid="sync-delete-warn">
                  {rows
                    .filter((r) => r.kind === 'deleted' && picked[r.rel])
                    .slice(0, 5)
                    .map((r) => (
                      <div key={r.rel}>{r.rel}</div>
                    ))}
                </div>
              ) : null}
              <ul className="sync-rows">
                {groups.flatMap((k) =>
                  collapsed[k]
                    ? []
                    : rows
                        .filter((r) => r.kind === k)
                        .map((r) => (
                          <li key={r.rel}>
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(picked[r.rel])}
                                disabled={r.kind === 'same'}
                                onChange={(e) => setPicked((p) => ({ ...p, [r.rel]: e.target.checked }))}
                              />
                              <span className={`sync-kind sync-kind--${r.kind}`}>{kindLabel[r.kind]}</span>
                              <span className="sync-rel">{r.rel}</span>
                              <span className="sync-size">{formatBytes(r.size)}</span>
                            </label>
                          </li>
                        ))
                )}
              </ul>
            </>
          )}
        </div>
      ) : null}
      {step === 3 ? (
        <div className="sync-step" data-testid="sync-step-run">
          <p>{running ? tg('d2.queued', { n: copyCount }) : tg('d2.queued', { n: copyCount })}</p>
          {saveHint ? <p className="sftp-ok">{tg('d2.saved')}</p> : null}
        </div>
      ) : null}
    </Modal>
  )
}
