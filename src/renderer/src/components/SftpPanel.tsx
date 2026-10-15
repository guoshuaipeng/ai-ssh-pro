import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SftpListEntry, SftpListResult, SftpProgressEvent } from '@shared/ipc'
import { isDemoSessionId } from '@shared/demo-host'
import {
  NARROW_PANE_PX,
  PART_SUFFIX,
  baseName,
  formatBytes,
  formatEta,
  formatSpeed,
  hydrateQueue,
  isPartName,
  joinPosix,
  keepBothName,
  parentPosix,
  partPath,
  pctOf,
  queueSummary,
  resumeDecision,
  type TransferTask
} from '@shared/sftp-queue'
import type { SyncProfile, SyncRow } from '@shared/folder-sync'
import { normalizeSyncProfile } from '@shared/folder-sync'
import { tg } from '../lib/i18n'
import { friendlyErrorMessage } from '../lib/friendly-error'
import { askText, confirmDialog } from '../lib/dialogs'
import { showToast } from '../lib/toast'
import { registerFolderSyncRunner } from '../lib/folder-sync-run'
import { registerSftpCloseGuard, takeFolderSync } from '../lib/sftp-activity'
import { loadSmartPrefs, saveSmartPrefs } from '../lib/smart-history'
import { openContextMenu } from './ContextMenu'
import EmptyState from './EmptyState'
import FolderSyncModal from './FolderSyncModal'
import { isLikelyTextFile } from './RemoteTextEditor'
import { captureRemoteSnapshot } from '../lib/remote-snapshot'
import { loadSftpDensity, resolveSftpDensity, saveSftpDensity, SFTP_DENSITY_EVENT, type SftpDensityPref } from '@shared/sftp-density'

type Props = {
  sessionId: string | null
  sessionTitle?: string
  hostKey?: string
  hostLabel?: string
  hostName?: string
  tags?: string[]
  connected?: boolean
  onClose: () => void
  onReconnect?: () => void
  onOpenRemoteFile?: (info: { remotePath: string; name: string; size: number }) => void
  onCompare?: (info: { localPath: string; remotePath: string; localName: string; remoteName: string; localSize: number; remoteSize: number }) => void
  /** S2: called before a remote upload, delete, mkdir, or rename. Return false to cancel. */
  beforeRemoteWrite?: () => Promise<boolean>
  /** S2: read-only and not temporarily unlocked. Remote write controls stay disabled. */
  remoteWritesBlocked?: boolean
  /** L8: pin the current sync plan into a center tab. */
  onPinPreview?: (plan: { direction: 'upload' | 'download'; localRoot: string; remoteRoot: string; rows: SyncRow[]; deleteExtra: boolean }) => void
  /** W3: host profile that owns snapshots for this session. */
  profileId?: string
  onOpenHistory?: (remotePath: string) => void
}

type PaneId = 'local' | 'remote'
type ConflictChoice = 'overwrite' | 'skip' | 'rename' | 'resume' | 'cancel'

const QUEUE_KEY = 'aiss.sftpQueue'
const PROFILE_KEY = 'aiss.syncProfiles'

function formatMode(mode?: number): string {
  if (typeof mode !== 'number') return '—'
  const m = mode & 0o777
  const tri = (v: number) => `${v & 4 ? 'r' : '-'}${v & 2 ? 'w' : '-'}${v & 1 ? 'x' : '-'}`
  return tri((m >> 6) & 7) + tri((m >> 3) & 7) + tri(m & 7)
}

function formatTime(ms?: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

function joinLocal(dir: string, name: string): string {
  if (!dir) return name
  if (dir.endsWith('/') || dir.endsWith('\\')) return dir + name
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return dir + sep + name
}

function parentLocal(p: string): string {
  const norm = p.replace(/[\\/]+$/, '')
  const i = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'))
  if (i <= 0) return norm || p
  return norm.slice(0, i) || norm
}

function loadProfiles(): SyncProfile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]') as unknown[]
    return raw.map(normalizeSyncProfile).filter((x): x is SyncProfile => Boolean(x))
  } catch {
    return []
  }
}

function saveProfiles(list: SyncProfile[]): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(list))
}

export function loadSyncProfiles(): SyncProfile[] {
  return loadProfiles()
}

export default function SftpPanel({
  sessionId,
  sessionTitle,
  hostKey = '',
  hostLabel,
  hostName,
  tags,
  connected = true,
  onClose,
  onReconnect,
  onOpenRemoteFile,
  onCompare,
  beforeRemoteWrite,
  remoteWritesBlocked = false,
  onPinPreview,
  profileId,
  onOpenHistory
}: Props) {
  const readOnly = Boolean(sessionId && isDemoSessionId(sessionId))
  const [snapPaths, setSnapPaths] = useState<Set<string>>(new Set())
  const roTitle = readOnly ? tg('ux34.readOnly') : undefined
  const rootRef = useRef<HTMLDivElement>(null)
  const runSyncRef = useRef<(plan: { direction: 'upload' | 'download'; localRoot: string; remoteRoot: string; rows: SyncRow[]; deleteExtra: boolean }) => void>(() => {})
  useEffect(() => {
    if (!sessionId) return
    return registerFolderSyncRunner(sessionId, (plan) => {
      runSyncRef.current(plan)
    })
  }, [sessionId])
  const [narrow, setNarrow] = useState(false)
  const [winW, setWinW] = useState(() => (typeof window === 'undefined' ? 1400 : window.innerWidth))
  const [densityPref, setDensityPref] = useState<SftpDensityPref>(() => loadSftpDensity())
  const density = resolveSftpDensity(densityPref, winW)
  const compact = density === 'compact'
  const [crumbOpen, setCrumbOpen] = useState(false)
  const [pane, setPane] = useState<PaneId>('remote')
  const [activePane, setActivePane] = useState<PaneId>('remote')
  const [showHidden, setShowHidden] = useState(false)
  const [autoResume, setAutoResume] = useState(() => loadSmartPrefs().autoResume)

  const [localCwd, setLocalCwd] = useState('')
  const [localInput, setLocalInput] = useState('')
  const [localEntries, setLocalEntries] = useState<SftpListEntry[]>([])
  const [localSel, setLocalSel] = useState<Record<string, boolean>>({})
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const [remoteCwd, setRemoteCwd] = useState('/')
  const [remoteInput, setRemoteInput] = useState('/')
  const [remoteEntries, setRemoteEntries] = useState<SftpListEntry[]>([])
  useEffect(() => {
    if (!profileId || !window.aiss?.snapshots?.list) return
    void window.aiss.snapshots.list({ profileId }).then((rows) => {
      setSnapPaths(new Set(rows.map((r) => String(r.path || ''))))
    }).catch(() => undefined)
  }, [profileId, remoteEntries])
  const [remoteSel, setRemoteSel] = useState<Record<string, boolean>>({})
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)

  const [tasks, setTasks] = useState<TransferTask[]>([])
  const [queueOpen, setQueueOpen] = useState(true)
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncDirection, setSyncDirection] = useState<'upload' | 'download'>('upload')
  const [syncProfile, setSyncProfile] = useState<SyncProfile | null>(null)
  const [conflict, setConflict] = useState<{
    name: string
    remaining: number
    canResume: boolean
    applyRest: boolean
    resolve: (c: ConflictChoice, applyRest: boolean) => void
  } | null>(null)
  const speedRef = useRef<Record<string, { t: number; bytes: number }>>({})
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const policyRef = useRef<ConflictChoice | null>(null)

  const visible = (entries: SftpListEntry[]) => (showHidden ? entries : entries.filter((e) => !e.name.startsWith('.')))
  const localShown = useMemo(() => visible(localEntries), [localEntries, showHidden])
  const remoteShown = useMemo(() => visible(remoteEntries), [remoteEntries, showHidden])

  const refreshLocal = useCallback(async (dir?: string) => {
    const api = window.aiss?.localFs
    if (!api) return
    setLocalLoading(true)
    setLocalError(null)
    try {
      const res = await api.list(dir || localCwd || '')
      setLocalCwd(res.path)
      setLocalInput(res.path)
      setLocalEntries(res.entries)
      setLocalSel({})
    } catch (e) {
      setLocalError(friendlyErrorMessage(e))
    } finally {
      setLocalLoading(false)
    }
  }, [localCwd])

  const refreshRemote = useCallback(async (path?: string) => {
    if (!sessionId) return
    const api = window.aiss?.sftp
    if (!api) return
    setRemoteLoading(true)
    setRemoteError(null)
    try {
      const res = await api.list(sessionId, path || remoteCwd || '/')
      setRemoteCwd(res.path)
      setRemoteInput(res.path)
      setRemoteEntries(res.entries)
      setRemoteSel({})
    } catch (e) {
      setRemoteError(friendlyErrorMessage(e))
    } finally {
      setRemoteLoading(false)
    }
  }, [remoteCwd, sessionId])

  useEffect(() => {
    void (async () => {
      const home = await window.aiss?.localFs?.home?.().catch(() => '')
      await refreshLocal(home || '')
    })()
    // initial local listing only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sessionId) return
    void (async () => {
      try {
        const home = await window.aiss.sftp.home(sessionId)
        await refreshRemote(home || '/')
      } catch {
        await refreshRemote('/')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < NARROW_PANE_PX))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth)
    const onPref = () => setDensityPref(loadSftpDensity())
    window.addEventListener('resize', onResize)
    window.addEventListener(SFTP_DENSITY_EVENT, onPref)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener(SFTP_DENSITY_EVENT, onPref)
    }
  }, [])

  const persist = useCallback((next: TransferTask[]) => {
    const keep = next.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(keep))
    } catch {
      /* ignore */
    }
    void window.aiss?.sftp?.queueSave?.(keep).catch(() => undefined)
  }, [])

  useEffect(() => {
    persist(tasks)
  }, [tasks, persist])

  const patchTask = useCallback((id: string, patch: Partial<TransferTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)))
  }, [])

  useEffect(() => {
    const api = window.aiss?.sftp
    if (!api?.onProgress) return
    return api.onProgress((p: SftpProgressEvent) => {
      setTasks((prev) => {
        const i = prev.findIndex((t) => t.id === p.transferId)
        if (i < 0) return prev
        const cur = prev[i]!
        const now = Date.now()
        const prevSp = speedRef.current[p.transferId]
        let speed = cur.speedBps
        if (prevSp && now - prevSp.t >= 250) {
          speed = Math.max(0, ((p.transferred - prevSp.bytes) * 1000) / (now - prevSp.t))
          speedRef.current[p.transferId] = { t: now, bytes: p.transferred }
        } else if (!prevSp) speedRef.current[p.transferId] = { t: now, bytes: p.transferred }
        const status: TransferTask['status'] = p.error === 'aborted' ? 'paused' : p.error ? 'interrupted' : p.done ? 'done' : 'running'
        const next = [...prev]
        next[i] = {
          ...cur,
          name: p.name || cur.name,
          transferred: p.transferred || cur.transferred,
          total: p.total || cur.total,
          speedBps: speed,
          status,
          error: p.error && p.error !== 'aborted' ? p.error : undefined
        }
        return next
      })
    })
  }, [])

  const askConflict = (name: string, remaining: number, canResume: boolean) =>
    new Promise<{ choice: ConflictChoice; applyRest: boolean }>((resolve) => {
      if (policyRef.current && policyRef.current !== 'cancel') {
        resolve({ choice: policyRef.current, applyRest: true })
        return
      }
      setConflict({
        name,
        remaining,
        canResume,
        applyRest: false,
        resolve: (choice, applyRest) => {
          if (applyRest && choice !== 'cancel') policyRef.current = choice
          setConflict(null)
          resolve({ choice, applyRest })
        }
      })
    })

  const runTransfer = useCallback(
    async (task: TransferTask, offset = 0) => {
      if (!sessionId || !window.aiss?.sftp?.transfer) return
      patchTask(task.id, { status: 'running', error: undefined, transferred: offset })
      try {
        await window.aiss.sftp.transfer({
          sessionId,
          direction: task.direction,
          localPath: task.localPath,
          remotePath: task.remotePath,
          transferId: task.id,
          offset
        })
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== task.id) return t
            if (t.status === 'paused' || t.status === 'interrupted') return t
            return { ...t, status: 'done', transferred: t.total || t.transferred }
          })
        )
        if (task.direction === 'upload') void refreshRemote(remoteCwd)
        else void refreshLocal(localCwd)
      } catch (e) {
        const msg = friendlyErrorMessage(e)
        patchTask(task.id, { status: msg === 'aborted' ? 'paused' : 'interrupted', error: msg === 'aborted' ? undefined : msg })
      }
    },
    [localCwd, patchTask, refreshLocal, refreshRemote, remoteCwd, sessionId]
  )

  const enqueueFile = useCallback(
    async (direction: 'upload' | 'download', localPath: string, remotePath: string, name: string, sourceMtime?: number, offset = 0) => {
      const id = `${direction === 'upload' ? 'ul' : 'dl'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const task: TransferTask = {
        id,
        name,
        direction,
        localPath,
        remotePath,
        hostKey,
        transferred: offset,
        total: 0,
        sourceMtime,
        status: 'queued',
        updatedAt: Date.now()
      }
      setTasks((prev) => [task, ...prev])
      setQueueOpen(true)
      window.dispatchEvent(new CustomEvent('aiss-task-transfer'))
      await runTransfer(task, offset)
    },
    [hostKey, runTransfer]
  )

  const transferFiles = useCallback(
    async (direction: 'upload' | 'download', files: { name: string; localPath: string; remotePath: string; size: number; mtime?: number; isPart?: boolean }[]) => {
      if (!sessionId) return
      if (direction === 'upload' && beforeRemoteWrite) {
        const ok = await beforeRemoteWrite()
        if (!ok) return
      }
      if (direction === 'upload' && readOnly) {
        setRemoteError(tg('ux34.noUpload'))
        return
      }
      policyRef.current = null
      let index = 0
      for (const file of files) {
        index += 1
        const targetEntries = direction === 'upload' ? remoteEntries : localEntries
        const targetDir = direction === 'upload' ? remoteCwd : localCwd
        const exists = targetEntries.find((e) => e.name === file.name && !e.isDirectory)
        const part = targetEntries.find((e) => e.name === file.name + PART_SUFFIX || (isPartName(e.name) && e.name.slice(0, -PART_SUFFIX.length) === file.name))
        let destLocal = file.localPath
        let destRemote = file.remotePath
        let offset = 0
        let mtime = file.mtime
        if (exists || part || file.isPart) {
          const answer = await askConflict(file.name, files.length - index, Boolean(part || file.isPart))
          if (answer.choice === 'cancel' || answer.choice === 'skip') continue
          if (answer.choice === 'rename') {
            const taken = new Set(targetEntries.map((e) => e.name))
            const renamed = keepBothName(file.name, taken)
            if (direction === 'upload') destRemote = joinPosix(targetDir, renamed)
            else destLocal = joinLocal(targetDir, renamed)
          } else if (answer.choice === 'resume') {
            offset = part?.size || file.size || 0
            if (direction === 'upload') destRemote = joinPosix(targetDir, file.name)
          }
        }
        await enqueueFile(direction, destLocal, destRemote, baseName(direction === 'upload' ? destRemote : destLocal), mtime, offset)
      }
    },
    [beforeRemoteWrite, enqueueFile, localCwd, localEntries, readOnly, remoteCwd, remoteEntries, sessionId]
  )

  const uploadSelected = () => {
    const files = localShown.filter((e) => localSel[e.path] && !e.isDirectory)
    void transferFiles(
      'upload',
      files.map((e) => ({
        name: e.name,
        localPath: e.path,
        remotePath: joinPosix(remoteCwd, e.name),
        size: e.size,
        mtime: e.modifyTime
      }))
    )
  }
  const downloadSelected = () => {
    const files = remoteShown.filter((e) => remoteSel[e.path] && !e.isDirectory)
    void transferFiles(
      'download',
      files.map((e) => ({
        name: isPartName(e.name) ? e.name.slice(0, -PART_SUFFIX.length) : e.name,
        localPath: joinLocal(localCwd, isPartName(e.name) ? e.name.slice(0, -PART_SUFFIX.length) : e.name),
        remotePath: e.path,
        size: e.size,
        mtime: e.modifyTime,
        isPart: isPartName(e.name)
      }))
    )
  }

  const resumeTask = useCallback(
    async (task: TransferTask, forceRestart = false) => {
      if (!sessionId) return
      let sourceMtime = task.sourceMtime
      let partSize = task.transferred
      try {
        if (task.direction === 'upload') {
          const st = await window.aiss.localFs.stat(task.localPath)
          sourceMtime = st?.mtime ?? sourceMtime
          const remoteStat = await window.aiss.sftp.stat?.(sessionId, partPath(task.remotePath))
          partSize = remoteStat?.size ?? partSize
        } else {
          const st = await window.aiss.localFs.stat(partPath(task.localPath))
          partSize = st?.size ?? partSize
          const remoteStat = await window.aiss.sftp.stat?.(sessionId, task.remotePath)
          sourceMtime = remoteStat?.mtime ?? sourceMtime
        }
      } catch {
        /* stat is best-effort */
      }
      const decision = forceRestart ? 'fresh' : resumeDecision({ partSize, total: task.total, sourceMtime, recordedMtime: task.sourceMtime })
      if (decision === 'source-changed') {
        const ok = await confirmDialog({
          title: tg('d1.sourceChanged'),
          body: task.name,
          confirmText: tg('d1.retransfer')
        })
        if (!ok) return
        await runTransfer({ ...task, sourceMtime }, 0)
        return
      }
      await runTransfer({ ...task, sourceMtime }, decision === 'resume' ? partSize : 0)
    },
    [runTransfer, sessionId]
  )
  const resumeRef = useRef(resumeTask)
  resumeRef.current = resumeTask

  useEffect(() => {
    let alive = true
    void (async () => {
      let loaded: TransferTask[] = []
      try {
        const remote = await window.aiss?.sftp?.queueLoad?.()
        if (Array.isArray(remote) && remote.length) loaded = hydrateQueue(remote)
      } catch {
        /* ignore */
      }
      if (!loaded.length) {
        try {
          loaded = hydrateQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'))
        } catch {
          loaded = []
        }
      }
      if (!alive) return
      setTasks(loaded)
      if (!sessionId || connected === false) return
      const prefs = loadSmartPrefs()
      for (const t of loaded) {
        if (t.hostKey === hostKey && prefs.autoResume && (t.status === 'interrupted' || t.status === 'paused')) {
          void resumeRef.current(t)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [sessionId, hostKey, connected])

  useEffect(() => {
    const active = tasks.filter((t) => t.status === 'running' || t.status === 'queued').length
    registerSftpCloseGuard(async () => {
      if (active <= 0) return 'close'
      return await new Promise<'close' | 'cancel-close' | 'stay'>((resolve) => {
        const onAnswer = (e: Event) => {
          const d = (e as CustomEvent<'close' | 'cancel-close' | 'stay'>).detail
          window.removeEventListener('aiss-sftp-close-answer', onAnswer)
          resolve(d || 'stay')
        }
        window.addEventListener('aiss-sftp-close-answer', onAnswer)
        window.dispatchEvent(new CustomEvent('aiss-sftp-close-ask', { detail: active }))
      })
    })
    return () => registerSftpCloseGuard(null)
  }, [tasks])

  const [closeAsk, setCloseAsk] = useState<number | null>(null)
  useEffect(() => {
    const onAsk = (e: Event) => setCloseAsk((e as CustomEvent<number>).detail || 1)
    window.addEventListener('aiss-sftp-close-ask', onAsk)
    return () => window.removeEventListener('aiss-sftp-close-ask', onAsk)
  }, [])
  const answerClose = (v: 'close' | 'cancel-close' | 'stay') => {
    setCloseAsk(null)
    window.dispatchEvent(new CustomEvent('aiss-sftp-close-answer', { detail: v }))
    if (v === 'cancel-close') {
      for (const t of tasksRef.current) {
        if (t.status === 'running' || t.status === 'queued') void window.aiss?.sftp?.cancel?.(t.id)
      }
    }
  }

  useEffect(() => {
    const apply = (profileId: string) => {
      takeFolderSync()
      if (profileId) {
        const found = loadProfiles().find((p) => p.id === profileId) || null
        setSyncProfile(found)
        if (found) setSyncDirection(found.direction)
      } else {
        setSyncProfile(null)
        setSyncDirection('upload')
      }
      setSyncOpen(true)
    }
    const openSync = (e: Event) => apply(String((e as CustomEvent<string>).detail || ''))
    const runProfile = (e: Event) => apply(String((e as CustomEvent<string>).detail || ''))
    window.addEventListener('aiss-open-folder-sync', openSync)
    window.addEventListener('aiss-run-sync-profile', runProfile as EventListener)
    const left = takeFolderSync()
    if (left) apply(left.profileId || '')
    return () => {
      window.removeEventListener('aiss-open-folder-sync', openSync)
      window.removeEventListener('aiss-run-sync-profile', runProfile as EventListener)
    }
  }, [])

  const onDropRemote = (ev: React.DragEvent) => {
    ev.preventDefault()
    const internal = ev.dataTransfer.getData('application/x-aiss-sftp')
    if (internal) {
      try {
        const data = JSON.parse(internal) as { side: PaneId; path: string; name: string; isDir: boolean; size: number; mtime?: number }
        if (data.side === 'local' && !data.isDir) {
          void transferFiles('upload', [{ name: data.name, localPath: data.path, remotePath: joinPosix(remoteCwd, data.name), size: data.size, mtime: data.mtime }])
        }
      } catch {
        /* ignore */
      }
      return
    }
    if (readOnly) {
      setRemoteError(tg('ux34.noUpload'))
      return
    }
    const paths = Array.from(ev.dataTransfer.files || [])
      .map((f) => window.aiss.fs.pathForFile?.(f) || (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p))
    if (!paths.length) {
      setRemoteError(tg('sftp.dropNeedPath'))
      return
    }
    void transferFiles(
      'upload',
      paths.map((p) => ({ name: baseName(p), localPath: p, remotePath: joinPosix(remoteCwd, baseName(p)), size: 0 }))
    )
  }

  const onDropLocal = (ev: React.DragEvent) => {
    ev.preventDefault()
    const internal = ev.dataTransfer.getData('application/x-aiss-sftp')
    if (!internal) return
    try {
      const data = JSON.parse(internal) as { side: PaneId; path: string; name: string; isDir: boolean; size: number; mtime?: number }
      if (data.side === 'remote' && !data.isDir) {
        void transferFiles('download', [{ name: data.name, localPath: joinLocal(localCwd, data.name), remotePath: data.path, size: data.size, mtime: data.mtime }])
      }
    } catch {
      /* ignore */
    }
  }

  const removeEntry = async (side: PaneId, entry: SftpListEntry) => {
    if (side === 'remote') {
      if (!sessionId || readOnly) return
      if (beforeRemoteWrite) {
        const allowed = await beforeRemoteWrite()
        if (!allowed) return
      }
      const ok = await confirmDialog({
        title: tg('d1.deleteN', { n: 1 }),
        body: `${entry.name}\n${tg('d1.remoteIrreversible')}`,
        danger: true,
        confirmText: tg('d1.deleteN', { n: 1 })
      })
      if (!ok) return
      await window.aiss.sftp.remove(sessionId, entry.path)
      await refreshRemote(remoteCwd)
      return
    }
    const trashed = await window.aiss.localFs.trash(entry.path)
    showToast(tg('d1.trashed', { name: entry.name }), {
      action: trashed.token
        ? {
            label: tg('d1.undo'),
            run: () => {
              void window.aiss.localFs.restore(trashed.token).then(() => refreshLocal(localCwd))
            }
          }
        : undefined
    })
    await refreshLocal(localCwd)
  }

  const allowRemoteWrite = async (): Promise<boolean> => {
    if (readOnly) return false
    if (!beforeRemoteWrite) return true
    return beforeRemoteWrite()
  }

  const mkdir = async (side: PaneId) => {
    if (side === 'remote' && (!sessionId || !(await allowRemoteWrite()))) return
    const name = await askText(tg('sftp.newDirName'))
    if (!name?.trim()) return
    if (side === 'local') {
      await window.aiss.localFs.mkdir(joinLocal(localCwd, name.trim()))
      await refreshLocal(localCwd)
    } else if (sessionId) {
      await window.aiss.sftp.mkdir(sessionId, joinPosix(remoteCwd, name.trim()))
      await refreshRemote(remoteCwd)
    }
  }

  const renameEntry = async (side: PaneId, entry: SftpListEntry) => {
    if (side === 'remote' && (!sessionId || !(await allowRemoteWrite()))) return
    const next = await askText(tg('sftp.newName'), entry.name)
    if (!next?.trim() || next.trim() === entry.name) return
    if (side === 'local') {
      await window.aiss.localFs.rename(entry.path, joinLocal(parentLocal(entry.path), next.trim()))
      await refreshLocal(localCwd)
    } else if (sessionId) {
      await window.aiss.sftp.rename(sessionId, entry.path, joinPosix(parentPosix(entry.path), next.trim()))
      await refreshRemote(remoteCwd)
    }
  }

  const summary = queueSummary(tasks)
  const showLocal = !narrow || pane === 'local'
  const showRemote = !narrow || pane === 'remote'

  const onPaneKey = (side: PaneId, entries: SftpListEntry[], selected: Record<string, boolean>) => (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.key === 'Tab') {
      e.preventDefault()
      const next = side === 'local' ? 'remote' : 'local'
      setActivePane(next)
      if (narrow) setPane(next)
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (side === 'local') void refreshLocal(parentLocal(localCwd))
      else void refreshRemote(parentPosix(remoteCwd))
      return
    }
    if (e.key === 'F5') {
      e.preventDefault()
      if (side === 'local') void refreshLocal(localCwd)
      else void refreshRemote(remoteCwd)
      return
    }
    const current = entries.find((en) => selected[en.path]) || entries[0]
    if (!current) return
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (side === 'local') uploadSelected()
      else downloadSelected()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (current.isDirectory) {
        if (side === 'local') void refreshLocal(current.path)
        else void refreshRemote(current.path)
      } else if (side === 'remote') onOpenRemoteFile?.({ remotePath: current.path, name: current.name, size: current.size })
      return
    }
    if (e.key === 'F2') {
      e.preventDefault()
      void renameEntry(side, current)
      return
    }
    if (e.key === 'Delete') {
      e.preventDefault()
      void removeEntry(side, current)
    }
  }

  const renderPane = (side: PaneId) => {
    const isLocal = side === 'local'
    const cwd = isLocal ? localCwd : remoteCwd
    const input = isLocal ? localInput : remoteInput
    const setInput = isLocal ? setLocalInput : setRemoteInput
    const entries = isLocal ? localShown : remoteShown
    const loading = isLocal ? localLoading : remoteLoading
    const error = isLocal ? localError : remoteError
    const selected = isLocal ? localSel : remoteSel
    const setSelected = isLocal ? setLocalSel : setRemoteSel
    const disconnected = !isLocal && connected === false
    return (
      <section
        className={`sftp-pane${activePane === side ? ' is-active' : ''}`}
        data-testid={`sftp-pane-${side}`}
        tabIndex={0}
        onFocus={() => setActivePane(side)}
        onKeyDown={onPaneKey(side, entries, selected)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={isLocal ? onDropLocal : onDropRemote}
      >
        <div className="sftp-pane-head">
          <div className="sftp-pane-title">
            {isLocal ? tg('d1.local') : `${tg('d1.remote')}${hostLabel ? ` · ${hostLabel}` : ''}`}
            {compact ? (
              <button type="button" className="sftp-crumb-toggle" onClick={() => setCrumbOpen((v) => !v)}>
                {tg('ux46.crumb')}
              </button>
            ) : null}
          </div>
          {!compact || crumbOpen ? (
          <div className="sftp-pathbar">
            <button type="button" onClick={() => (isLocal ? void refreshLocal(parentLocal(cwd)) : void refreshRemote(parentPosix(cwd)))} disabled={!cwd || cwd === '/'}>
              {tg('sftp.up')}
            </button>
            <input
              value={input}
              aria-label={isLocal ? tg('d1.localPath') : tg('sftp.remotePath')}
              spellCheck={false}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation()
                  if (isLocal) void refreshLocal(input)
                  else void refreshRemote(input.startsWith('/') ? input : `/${input}`)
                }
              }}
            />
            <button type="button" onClick={() => (isLocal ? void refreshLocal(cwd) : void refreshRemote(cwd))}>
              {tg('sftp.refresh')}
            </button>
            <button
              type="button"
              data-testid={isLocal ? undefined : 'sftp-remote-mkdir'}
              title={isLocal ? undefined : readOnly ? roTitle : remoteWritesBlocked ? tg('l4.readonlyBlocked') : undefined}
              disabled={!isLocal && (readOnly || remoteWritesBlocked || !sessionId)}
              onClick={() => void mkdir(side)}
            >
              {tg('sftp.mkdir')}
            </button>
            <button type="button" className={showHidden ? 'is-on' : ''} onClick={() => setShowHidden((v) => !v)} title={tg('d1.hidden')}>
              <span className="sftp-label">{tg('d1.hidden')}</span>
            </button>
          </div>
          ) : null}
        </div>
        {error ? <div className="sftp-error">{error}</div> : null}
        <div className={`sftp-browser${disconnected ? ' is-disconnected' : ''}`}>
          {disconnected ? (
            <div className="sftp-disconnect" data-testid="sftp-disconnected">
              <div>{tg('d1.disconnected')}</div>
              <button type="button" className="primary" onClick={() => onReconnect?.()} disabled={!onReconnect}>
                {tg('d1.reconnect')}
              </button>
            </div>
          ) : null}
          {loading && entries.length === 0 ? (
            <div className="sftp-skel" data-testid="sftp-skel">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="sftp-skel-row" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              compact
              testId={isLocal ? 'sftp-local-empty' : 'sftp-empty'}
              icon={readOnly && !isLocal ? '🔒' : '📂'}
              title={readOnly && !isLocal ? tg('ux34.emptyTitle') : tg('ux08.sftpTitle')}
              desc={readOnly && !isLocal ? tg('ux34.emptyDesc') : tg('ux08.sftpDesc')}
            />
          ) : (
            <table className="sftp-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  <th>{tg('sftp.colName')}</th>
                  <th style={{ width: 72 }}>{tg('sftp.colSize')}</th>
                  <th style={{ width: 132 }}>{tg('sftp.colTime')}</th>
                  {!isLocal ? <th style={{ width: 78 }}>{tg('d1.perm')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.path}
                    className={selected[e.path] ? 'is-selected' : ''}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData(
                        'application/x-aiss-sftp',
                        JSON.stringify({ side, path: e.path, name: e.name, isDir: e.isDirectory, size: e.size, mtime: e.modifyTime })
                      )
                      ev.dataTransfer.effectAllowed = 'copy'
                    }}
                    onDoubleClick={() => {
                      if (e.isDirectory) {
                        if (isLocal) void refreshLocal(e.path)
                        else void refreshRemote(e.path)
                      } else if (!isLocal) onOpenRemoteFile?.({ remotePath: e.path, name: e.name, size: e.size })
                    }}
                    onContextMenu={(ev) => {
                      if (e.isDirectory) {
                        openContextMenu(ev, [
                          {
                            id: 'sync',
                            label: isLocal ? tg('d2.toRemote') : tg('d2.toLocal'),
                            onSelect: () => {
                              if (isLocal) setLocalCwd(e.path)
                              else setRemoteCwd(e.path)
                              setSyncDirection(isLocal ? 'upload' : 'download')
                              setSyncProfile(null)
                              setSyncOpen(true)
                            }
                          }
                        ])
                        return
                      }
                      if (isLocal || (!onCompare && !onOpenHistory)) return
                      openContextMenu(ev, [
                        ...(onCompare
                          ? [{
                          id: 'compare-local',
                          label: tg('d5.compareWithLocal'),
                          onSelect: () => {
                            const local = localShown.filter((x) => localSel[x.path] && !x.isDirectory)
                            if (local.length !== 1) {
                              showToast(tg('d5.needPair'))
                              return
                            }
                            onCompare({
                              localPath: local[0]!.path,
                              remotePath: e.path,
                              localName: local[0]!.name,
                              remoteName: e.name,
                              localSize: local[0]!.size,
                              remoteSize: e.size
                            })
                          }
                        }]
                          : []),
                        {
                          id: 'version-history',
                          label: tg('w3.history'),
                          disabled: !isLikelyTextFile(e.name) || e.size > 2 * 1024 * 1024 || !snapPaths.has(e.path),
                          title: !isLikelyTextFile(e.name) || e.size > 2 * 1024 * 1024 ? tg('w3.notText') : snapPaths.has(e.path) ? tg('w3.history') : tg('w3.empty'),
                          onSelect: () => onOpenHistory?.(e.path)
                        }
                      ])
                    }}
                  >
                    <td>
                      <input type="checkbox" checked={Boolean(selected[e.path])} onChange={() => setSelected((s) => ({ ...s, [e.path]: !s[e.path] }))} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`sftp-name-btn${e.isDirectory ? ' is-dir' : ''}`}
                        onClick={() => {
                          if (e.isDirectory) {
                            if (isLocal) void refreshLocal(e.path)
                            else void refreshRemote(e.path)
                          } else if (!isLocal && onOpenRemoteFile && (isLikelyTextFile(e.name) || true)) {
                            onOpenRemoteFile({ remotePath: e.path, name: e.name, size: e.size })
                          }
                        }}
                      >
                        {e.isDirectory ? '📁 ' : '📄 '}
                        {e.name}
                      </button>
                    </td>
                    <td>{e.isDirectory ? '—' : formatBytes(e.size)}</td>
                    <td>{formatTime(e.modifyTime)}</td>
                    {!isLocal ? <td className="sftp-perm">{formatMode(e.mode)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    )
  }

  const runSync = (plan: { direction: 'upload' | 'download'; localRoot: string; remoteRoot: string; rows: SyncRow[]; deleteExtra: boolean }) => {
    void (async () => {
      if (!(await allowRemoteWrite())) return
      let kept = 0
      let skipped = 0
      for (const row of plan.rows) {
        if (row.kind === 'deleted') {
          if (!plan.deleteExtra) continue
          try {
            if (plan.direction === 'upload' && sessionId) {
              const remotePath = joinPosix(plan.remoteRoot, row.rel)
              const snap = await captureRemoteSnapshot({ sessionId, profileId, path: remotePath, source: 'syncDelete' })
              if (snap === 'kept') kept += 1
              else if (snap === 'skipped') skipped += 1
              await window.aiss.sftp.remove(sessionId, remotePath)
            }
            if (plan.direction === 'download') await window.aiss.localFs.trash(joinLocal(plan.localRoot, row.rel))
          } catch {
            /* counted in queue errors below when copies fail; deletes are best-effort */
          }
          continue
        }
        if (row.kind !== 'new' && row.kind !== 'changed') continue
        const localPath = joinLocal(plan.localRoot, row.rel)
        const remotePath = joinPosix(plan.remoteRoot, row.rel)
        if (plan.direction === 'upload' && row.kind === 'changed' && sessionId) {
          const snap = await captureRemoteSnapshot({ sessionId, profileId, path: remotePath, source: 'sync' })
          if (snap === 'kept') kept += 1
          else if (snap === 'skipped') skipped += 1
        }
        await enqueueFile(plan.direction, localPath, remotePath, baseName(row.rel))
      }
      if (kept) showToast(tg('w3.syncSnapN', { n: kept }))
      if (skipped) showToast(tg('w3.syncSkippedN', { n: skipped }))
      void refreshLocal(localCwd)
      void refreshRemote(remoteCwd)
    })()
  }
  runSyncRef.current = runSync

  return (
    <div
      className={`workspace-panel workspace-panel--sftp sftp-dual${compact ? ' is-compact' : ''}`}
      ref={rootRef}
      data-testid="sftp-dual"
      role="region"
      aria-label={`${tg('sftp.title')}${sessionTitle ? ` · ${sessionTitle}` : ''}`}
    >
      <div className="workspace-panel-toolbar sftp-toolbar" data-testid="sftp-toolbar">
        <div className="workspace-panel-actions sftp-toolbar-actions">
          {narrow ? (
            <div className="sftp-pane-toggle" role="tablist">
              <button type="button" className={pane === 'local' ? 'is-on' : ''} onClick={() => setPane('local')}>
                {tg('d1.local')}
              </button>
              <button type="button" className={pane === 'remote' ? 'is-on' : ''} onClick={() => setPane('remote')}>
                {tg('d1.remote')}
              </button>
            </div>
          ) : null}
          <button type="button" disabled={!sessionId} title={tg('d2.title')} onClick={() => { setSyncProfile(null); setSyncOpen(true) }}>
            <span className="sftp-ico" aria-hidden>↻</span>
            <span className="sftp-label">{tg('d2.title')}</span>
          </button>
          <button
            type="button"
            data-testid="sftp-compare"
            title={tg('d5.compare')}
            disabled={!onCompare}
            onClick={() => {
              const local = localShown.filter((e) => localSel[e.path] && !e.isDirectory)
              const remote = remoteShown.filter((e) => remoteSel[e.path] && !e.isDirectory)
              if (local.length !== 1 || remote.length !== 1) {
                showToast(tg('d5.needPair'))
                return
              }
              onCompare?.({
                localPath: local[0]!.path,
                remotePath: remote[0]!.path,
                localName: local[0]!.name,
                remoteName: remote[0]!.name,
                localSize: local[0]!.size,
                remoteSize: remote[0]!.size
              })
            }}
          >
            <span className="sftp-ico" aria-hidden>⇄</span>
            <span className="sftp-label">{tg('d5.compare')}</span>
          </button>
          <button
            type="button"
            title={compact ? tg('ux46.comfort') : tg('ux46.compact')}
            onClick={() => {
              const next: SftpDensityPref = densityPref === 'comfort' ? 'auto' : 'comfort'
              saveSftpDensity(next)
              setDensityPref(next)
              window.dispatchEvent(new CustomEvent(SFTP_DENSITY_EVENT))
            }}
          >
            <span className="sftp-label sftp-label-keep">{densityPref === 'comfort' ? tg('ux46.comfort') : tg('ux46.compact')}</span>
          </button>
          <label className="sftp-autoresume">
            <input
              type="checkbox"
              checked={autoResume}
              onChange={(e) => {
                const next = saveSmartPrefs({ ...loadSmartPrefs(), autoResume: e.target.checked })
                setAutoResume(next.autoResume)
              }}
            />
            {tg('d1.autoResume')}
          </label>
          <span className="sftp-queue-summary">
            {summary.active > 0 ? tg('d1.summary', { n: summary.active, speed: formatSpeed(summary.speed) }) : tg('d1.queue')}
          </span>
        </div>
      </div>
      <div className={`sftp-panes${narrow ? ' is-narrow' : ''}`}>
        {showLocal ? renderPane('local') : null}
        {!narrow ? (
          <div className="sftp-mid">
            <button type="button" disabled={!sessionId || readOnly || !localShown.some((e) => localSel[e.path] && !e.isDirectory)} title={roTitle} onClick={uploadSelected}>
              {tg('d1.toRemote')}
            </button>
            <button type="button" disabled={!sessionId || !remoteShown.some((e) => remoteSel[e.path] && !e.isDirectory)} onClick={downloadSelected}>
              {tg('d1.toLocal')}
            </button>
          </div>
        ) : null}
        {showRemote ? renderPane('remote') : null}
      </div>
      <div className="sftp-transfers" data-testid="sftp-queue">
        <button type="button" className="sftp-transfers-title" onClick={() => setQueueOpen((v) => !v)}>
          {queueOpen ? '▾' : '▸'} {tg('d1.queue')}
          {summary.active > 0 ? ` · ${tg('d1.summary', { n: summary.active, speed: formatSpeed(summary.speed) })}` : ''}
        </button>
        {queueOpen && tasks.length > 0 ? (
          <ul>
            {tasks.slice(0, 20).map((t) => (
              <li key={t.id} data-status={t.status}>
                <div className="sftp-transfer-meta">
                  <span>
                    {t.direction === 'upload' ? '↑' : '↓'} {t.name}
                  </span>
                  <span>
                    {t.status === 'done'
                      ? tg('sftp.done')
                      : t.status === 'paused'
                        ? tg('d1.paused')
                        : t.status === 'interrupted'
                          ? tg('d1.interrupted', { pct: pctOf(t.transferred, t.total) })
                          : t.status === 'error'
                            ? t.error || tg('sftp.failed')
                            : `${pctOf(t.transferred, t.total)}% ${formatSpeed(t.speedBps)} ${formatEta(t.transferred, t.total, t.speedBps)}`}
                  </span>
                </div>
                <div className="sftp-progress">
                  <div
                    className={`sftp-progress-bar${t.status === 'error' || t.status === 'interrupted' ? ' is-error' : ''}${t.status === 'done' ? ' is-done' : ''}`}
                    style={{ width: `${t.status === 'done' ? 100 : pctOf(t.transferred, t.total)}%` }}
                  />
                </div>
                <div className="sftp-transfer-actions">
                  {t.status === 'running' ? (
                    <button type="button" onClick={() => void window.aiss.sftp.cancel?.(t.id)}>
                      {tg('d1.pause')}
                    </button>
                  ) : null}
                  {t.status === 'paused' || t.status === 'interrupted' ? (
                    <button type="button" onClick={() => void resumeTask(t)}>
                      {tg('d1.resume')}
                    </button>
                  ) : null}
                  {t.status !== 'done' && t.status !== 'cancelled' ? (
                    <button
                      type="button"
                      onClick={() => {
                        void window.aiss.sftp.cancel?.(t.id)
                        patchTask(t.id, { status: 'cancelled' })
                      }}
                    >
                      {tg('d1.cancel')}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void window.aiss.localFs.reveal(t.direction === 'download' ? t.localPath : t.localPath)}>
                    {tg('d1.reveal')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {conflict ? (
        <div className="sftp-conflict" data-testid="sftp-conflict" role="dialog">
          <div className="sftp-conflict-card">
            <div className="sftp-conflict-title">{tg('d1.exists', { name: conflict.name })}</div>
            <div className="sftp-conflict-actions">
              <button type="button" className="primary" onClick={() => conflict.resolve('overwrite', conflict.applyRest)}>
                {tg('d1.overwrite')}
              </button>
              <button type="button" onClick={() => conflict.resolve('skip', conflict.applyRest)}>
                {tg('d1.skip')}
              </button>
              <button type="button" onClick={() => conflict.resolve('rename', conflict.applyRest)}>
                {tg('d1.keepBoth')}
              </button>
              {conflict.canResume ? (
                <button type="button" onClick={() => conflict.resolve('resume', conflict.applyRest)}>
                  {tg('d1.resume')}
                </button>
              ) : null}
              <button type="button" onClick={() => conflict.resolve('cancel', false)}>
                {tg('dlg.cancel')}
              </button>
            </div>
            {conflict.remaining > 0 ? (
              <label className="sync-check">
                <input type="checkbox" checked={conflict.applyRest} onChange={(e) => setConflict({ ...conflict, applyRest: e.target.checked })} />
                {tg('d1.applyRest', { n: conflict.remaining })}
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
      {closeAsk != null ? (
        <div className="sftp-conflict" data-testid="sftp-close-confirm" role="dialog">
          <div className="sftp-conflict-card">
            <div className="sftp-conflict-title">{tg('d1.busyClose', { n: closeAsk })}</div>
            <div className="sftp-conflict-actions">
              <button type="button" className="primary" onClick={() => answerClose('close')}>
                {tg('d1.keepBackground')}
              </button>
              <button type="button" className="danger" onClick={() => answerClose('cancel-close')}>
                {tg('d1.cancelAndClose')}
              </button>
              <button type="button" onClick={() => answerClose('stay')}>
                {tg('dlg.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <FolderSyncModal
        open={syncOpen}
        hostLabel={hostLabel || sessionTitle || hostKey}
        hostName={hostName || hostLabel || ''}
        hostKey={hostKey}
        tags={tags}
        localPath={localCwd}
        remotePath={remoteCwd}
        initialDirection={syncDirection}
        profile={syncProfile}
        onClose={() => setSyncOpen(false)}
        listLocal={(dir) => window.aiss.localFs.list(dir)}
        listRemote={(dir) => (sessionId ? window.aiss.sftp.list(sessionId, dir) : Promise.reject(new Error(tg('sftp.noSession'))))}
        hashLocal={(p) => window.aiss.localFs.hash(p)}
        hashRemote={(p) => (sessionId && window.aiss.sftp.hash ? window.aiss.sftp.hash(sessionId, p) : Promise.reject(new Error('hash')))}
        onRun={runSync}
        onPin={onPinPreview}
        onSaveProfile={(p) => {
          const all = loadProfiles().filter((x) => x.id !== p.id)
          saveProfiles([p, ...all])
        }}
      />
    </div>
  )
}
