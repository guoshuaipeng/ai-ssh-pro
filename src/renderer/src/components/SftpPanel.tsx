import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SftpListEntry, SftpListResult, SftpProgressEvent } from '@shared/ipc'
import { demoListDir, isDemoSessionId } from '@shared/demo-host'
import {
  NARROW_PANE_PX,
  PART_SUFFIX,
  baseName,
  clearFinishedTransfers,
  countFinishedTransfers,
  formatBytes,
  formatSpeed,
  formatTransferProgress,
  groupTransferTasks,
  hydrateQueue,
  isPartName,
  joinPosix,
  keepBothName,
  parentPosix,
  partPath,
  pctOf,
  mergeHostQueue,
  queueSummary,
  resumeDecision,
  type TransferGroupKey,
  type TransferTask
} from '@shared/sftp-queue'
import { normalizeGotoPath } from '@shared/sftp-goto-path'
import { sftpNameFilterMatch } from '@shared/sftp-name-filter'
import { nextSort, sortIsDesc, sortSftpEntries, type SftpSortMode } from '@shared/sftp-sort'
import type { SyncProfile, SyncRow } from '@shared/folder-sync'
import { normalizeSyncProfile } from '@shared/folder-sync'
import { disconnectStatusSentence } from '@shared/status-bar'
import { tg, useI18n } from '../lib/i18n'
import { friendlyError, friendlyErrorMessage } from '../lib/friendly-error'
import { noticeKind } from '@shared/product-error'
import ErrorNotice from './ErrorNotice'
import ConnectTrouble from './ConnectTrouble'
import { askText, confirmDialog } from '../lib/dialogs'
import { typeAheadIndex } from '@shared/select-nav'
import { parseMode, permBits, toOctal, toRwx } from '@shared/sftp-perm'
import { showToast } from '../lib/toast'
import { PENDING_UPLOAD_EVENT, takePendingUpload } from '../lib/pending-upload'
import { resolveHomePath, retryableTransfers } from '@shared/typed-command'
import { registerFolderSyncRunner } from '../lib/folder-sync-run'
import { recallTransferQueue, registerSftpCloseGuard, rememberTransferQueue, takeFolderSync } from '../lib/sftp-activity'
import { loadSmartPrefs, saveSmartPrefs } from '../lib/smart-history'
import { openContextMenu } from './ContextMenu'
import EmptyState from './EmptyState'
import { openDecision } from '@shared/sftp-open'
import { parentPath } from '@shared/term-path'
import { isRunnableName } from '@shared/local-open'
import { LOCAL_RECENT_KEY, noteRecentDir, recentDirs } from '@shared/sftp-recent-dirs'
import { SFTP_GOTO_EVENT, takeSftpGoto } from '../lib/sftp-goto'
import { AI_FILE_MAX_BYTES, buildFileContext, canAttachFile } from '@shared/ai-file-context'
import { requestAskWithContext } from '../lib/ai-prefill'
import Icon, { Twist } from './Icon'
import FolderSyncModal from './FolderSyncModal'
import { newFileProblem } from '@shared/sftp-new-file'
import SftpTreeSearch from './SftpTreeSearch'
import { isLikelyTextFile } from './RemoteTextEditor'
import { captureRemoteSnapshot } from '../lib/remote-snapshot'
import { loadSftpDensity, resolveSftpDensity, saveSftpDensity, SFTP_DENSITY_EVENT, type SftpDensityPref } from '@shared/sftp-density'
import { sftpCenterComfortLayout } from '@shared/sftp-center-layout'
import { cwdFromPwd, PWD_TIMEOUT_MS } from '@shared/sftp-host'
import { listedPathMatchesRequest, selectedDriveId, type LocalDrive } from '@shared/local-drives'
import { SCREENSHOT_EVENT, screenshotHooksEnabled } from '../lib/screenshot-hooks'
import Button from './ui/Button'
import PanelHeader from './ui/PanelHeader'
import { SESSION_CWD_EVENT, getSessionCwd } from '../lib/session-cwd-store'
import { SFTP_FOLLOW_KEY, followFailure, followTarget, sftpFollowEnabled } from '@shared/sftp-follow'

type Props = {
  /** D8: close confirm and queue belong to this tab only. */
  tabId?: string
  sessionId: string | null
  /** D7: on first open, list the session cwd (pwd). Re-focus does not remount, so the path stays. */
  alignSessionCwd?: boolean
  /** Host is still connecting; show a skeleton instead of the disconnect mask. */
  pendingConnect?: boolean
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
  /** PF-4: no session yet — pick a host instead of throwing. */
  onPickHost?: () => void
  /** W3: host profile that owns snapshots for this session. */
  profileId?: string
  onOpenHistory?: (remotePath: string) => void
  /** D28: fill `cd <remote dir>` into this session's terminal (not run) */
  onCdInTerminal?: (remotePath: string) => void
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


function transferFailTone(
  raw: string | undefined,
  locale: 'zh-CN' | 'en'
): { message: string; detail: string | null; kind: ReturnType<typeof noticeKind> } {
  const kind = noticeKind(raw || '')
  if (!raw?.trim()) {
    return { message: tg('sftp.failed'), detail: null, kind: 'generic' }
  }
  const friendly = friendlyError(raw, { locale })
  const mapped =
    kind === 'permission'
      ? tg('pf5.sftpPerm')
      : kind === 'dropped'
        ? tg('sftp.xferDropped')
        : kind === 'auth'
          ? tg('sftp.xferAuth')
          : kind === 'unreachable'
            ? tg('sftp.xferUnreachable')
            : friendly.message || tg('sftp.failed')
  const detail = friendly.detail && friendly.detail !== mapped ? friendly.detail : raw !== mapped ? raw : null
  return { message: mapped, detail, kind }
}


/** Clickable path crumbs for remote posix paths (and simple local unix-style). */
function pathCrumbs(cwd: string, isLocal: boolean): { label: string; path: string }[] {
  const raw = String(cwd || '').trim()
  if (!raw || raw === '/') return [{ label: '/', path: '/' }]
  if (isLocal && /^[A-Za-z]:[\\/]/.test(raw)) {
    const norm = raw.replace(/\\/g, '/')
    const m = norm.match(/^([A-Za-z]:)(\/.*)?$/)
    const drive = m?.[1] ?? norm.slice(0, 2)
    const rest = (m?.[2] || '/').replace(/\/+$/, '') || '/'
    const out: { label: string; path: string }[] = [{ label: drive + '/', path: drive + '\\' }]
    if (rest !== '/') {
      let acc = drive
      for (const part of rest.split('/').filter(Boolean)) {
        acc += '\\' + part
        out.push({ label: part, path: acc })
      }
    }
    return out
  }
  const norm = raw.replace(/\/+$/, '') || '/'
  if (norm === '/') return [{ label: '/', path: '/' }]
  const parts = norm.split('/').filter(Boolean)
  const out: { label: string; path: string }[] = [{ label: '/', path: '/' }]
  let acc = ''
  for (const part of parts) {
    acc += '/' + part
    out.push({ label: part, path: acc })
  }
  return out
}

export default function SftpPanel({
  tabId = '',
  onCdInTerminal,
  sessionId,
  alignSessionCwd = false,
  pendingConnect = false,
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
  onPickHost,
  profileId,
  onOpenHistory
}: Props) {
  const { locale } = useI18n()
  const readOnly = Boolean(sessionId && isDemoSessionId(sessionId))
  const [shotMock, setShotMock] = useState(false)
  const shotMockRef = useRef(false)
  const typeAheadRef = useRef({ text: '', at: 0 })
  shotMockRef.current = shotMock
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
  const [winH, setWinH] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight))
  const [densityPref, setDensityPref] = useState<SftpDensityPref>(() => loadSftpDensity())
  const density = resolveSftpDensity(densityPref, winW)
  const compact = density === 'compact'
  const centerLayout = sftpCenterComfortLayout(winW, winH)
  const [advancedOpen, setAdvancedOpen] = useState(() => !sftpCenterComfortLayout(
    typeof window === 'undefined' ? 1400 : window.innerWidth,
    typeof window === 'undefined' ? 900 : window.innerHeight
  ).advancedCollapsed)
  const [crumbOpen, setCrumbOpen] = useState(false)
  const [pane, setPane] = useState<PaneId>('remote')
  const [activePane, setActivePane] = useState<PaneId>('remote')
  const [showHidden, setShowHidden] = useState(false)
  const [nameFilter, setNameFilter] = useState('')
  const [sortMode, setSortMode] = useState<SftpSortMode>('name')
  const [sortFlip, setSortFlip] = useState(false)
  const [autoResume, setAutoResume] = useState(() => loadSmartPrefs().autoResume)

  const [localCwd, setLocalCwd] = useState('')
  const [localInput, setLocalInput] = useState('')
  const [localEntries, setLocalEntries] = useState<SftpListEntry[]>([])
  const [localSel, setLocalSel] = useState<Record<string, boolean>>({})
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [drives, setDrives] = useState<LocalDrive[]>([])
  const [drivePlatform, setDrivePlatform] = useState<'win32' | 'posix'>('posix')
  const [driveScan, setDriveScan] = useState(true)

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
  const [remoteOpening, setRemoteOpening] = useState(false)
  const [cwdFallback, setCwdFallback] = useState(false)
  const remoteCwdRef = useRef(remoteCwd)
  remoteCwdRef.current = remoteCwd
  const [followNote, setFollowNote] = useState<{ kind: 'denied' | 'missing'; path: string } | null>(null)
  const [follow, setFollow] = useState(() => sftpFollowEnabled((k) => { try { return localStorage.getItem(k) } catch { return null } }))
  const homeRef = useRef<{ sid: string; home: string | null } | null>(null)
  /** D12: the terminal's tracked cwd as an absolute path (the exec channel's pwd is always $HOME). */
  const resolveTracked = useCallback(async (): Promise<string | null> => {
    const c = getSessionCwd(sessionId)
    if (!c || !sessionId) return null
    if (c.startsWith('~') && homeRef.current?.sid !== sessionId) {
      let home: string | null = null
      try {
        home = (await window.aiss.sftp.home(sessionId)) || null
      } catch {
        home = null
      }
      homeRef.current = { sid: sessionId, home }
    }
    return followTarget({ follow: true, cwd: c, current: '\u0000', home: homeRef.current?.home ?? null })
  }, [sessionId])

  /** D41: a path from the terminal: expand ~, and a file (or missing path) falls back to its folder */
  const resolveGotoRef = useRef<(p: string) => Promise<string | null>>(async () => null)
  resolveGotoRef.current = async (p: string) => {
    if (!sessionId) return null
    let target = p
    if (p === '~' || p.startsWith('~/')) {
      let home = homeRef.current?.sid === sessionId ? homeRef.current.home : null
      if (!home) home = (await window.aiss.sftp.home(sessionId).catch(() => null)) || null
      if (!home) return null
      target = p === '~' ? home : `${home.replace(/\/+$/, '')}/${p.slice(2)}`
    }
    try {
      await window.aiss.sftp.list(sessionId, target)
      return target
    } catch {
      showToast(tg('d41.fileParent'))
      return parentPath(target)
    }
  }

  const applyScreenshotDual = useCallback(() => {
    if (!screenshotHooksEnabled()) return
    shotMockRef.current = true
    setShotMock(true)
    setRemoteError(null)
    setLocalError(null)
    setRemoteLoading(false)
    setLocalLoading(false)
    setRemoteOpening(false)
    setCwdFallback(false)
    const now = Date.now()
    // D9 visual QA: two failed transfers so "Retry all" shows
    if (sessionStorage.getItem('aiss.screenshot.sftpFailed') === '1') {
      setQueueOpen(true)
      setTasks([
        { id: 'shot-f1', name: 'app-2026.10.tar.gz', direction: 'upload', localPath: 'C:/tmp/app-2026.10.tar.gz', remotePath: '/home/demo/app-2026.10.tar.gz', hostKey: hostKey || '', transferred: 412_000_000, total: 980_000_000, status: 'interrupted', error: 'Connection lost', updatedAt: now },
        { id: 'shot-f2', name: 'nginx.conf', direction: 'download', localPath: 'C:/tmp/nginx.conf', remotePath: '/etc/nginx/nginx.conf', hostKey: hostKey || '', transferred: 0, total: 4_096, status: 'error', error: 'Permission denied', updatedAt: now }
      ])
    }
    const remotePath = '/home/demo'
    setRemoteCwd(remotePath)
    setRemoteInput(remotePath)
    setRemoteEntries(
      demoListDir(remotePath).map((e) => ({
        name: e.name,
        path: `${remotePath}/${e.name}`,
        isDirectory: e.dir,
        size: e.size,
        modifyTime: now - 86_400_000,
        mode: e.dir ? 0o755 : 0o644
      }) as SftpListEntry).concat(
        // D12b visual QA: symlinks + a follow notice
        sessionStorage.getItem('aiss.screenshot.sftpFollow') === '1'
          ? [
              { name: 'www', path: `${remotePath}/www`, isDirectory: true, size: 0, modifyTime: now - 3_600_000, link: 'dir' as const },
              { name: 'current.log', path: `${remotePath}/current.log`, isDirectory: false, size: 20_480, modifyTime: now - 600_000, link: 'file' as const },
              { name: 'old-release', path: `${remotePath}/old-release`, isDirectory: false, size: 0, modifyTime: now - 86_400_000 * 30, link: 'broken' as const }
            ]
          : []
      )
    )
    if (sessionStorage.getItem('aiss.screenshot.sftpFollow') === '1') setFollowNote({ kind: 'denied', path: '/root' })
    setRemoteSel({})
    const localPath = 'C:\\Users\\demo\\Projects\\demo-web'
    setLocalCwd(localPath)
    setLocalInput(localPath)
    const localRows: SftpListEntry[] = [
      { name: 'src', path: `${localPath}\\src`, isDirectory: true, size: 0, modifyTime: now - 3_600_000 },
      { name: 'public', path: `${localPath}\\public`, isDirectory: true, size: 0, modifyTime: now - 7_200_000 },
      { name: 'package.json', path: `${localPath}\\package.json`, isDirectory: false, size: 842, modifyTime: now - 86_400_000 },
      { name: 'README.md', path: `${localPath}\\README.md`, isDirectory: false, size: 1204, modifyTime: now - 172_800_000 },
      { name: '.env.example', path: `${localPath}\\.env.example`, isDirectory: false, size: 128, modifyTime: now - 259_200_000 },
      { name: 'vite.config.ts', path: `${localPath}\\vite.config.ts`, isDirectory: false, size: 410, modifyTime: now - 96_000_000 }
    ]
    setLocalEntries(localRows)
    setLocalSel({})
  }, [])

  useEffect(() => {
    const onShot = (ev: Event) => {
      if (!screenshotHooksEnabled()) return
      const detail = (ev as CustomEvent<{ op?: string }>).detail
      if (!detail || (detail.op !== 'sftpDual' && detail.op !== 'sftpMockFill')) return
      try { sessionStorage.removeItem('aiss.screenshot.sftpDualPending') } catch { /* ignore */ }
      applyScreenshotDual()
    }
    window.addEventListener(SCREENSHOT_EVENT, onShot)
    return () => window.removeEventListener(SCREENSHOT_EVENT, onShot)
  }, [applyScreenshotDual])

  // If App armed mock before this panel mounted (restore-hold → live), apply on mount.
  useEffect(() => {
    if (!screenshotHooksEnabled()) return
    try {
      if (sessionStorage.getItem('aiss.screenshot.sftpDualPending') !== '1') return
      sessionStorage.removeItem('aiss.screenshot.sftpDualPending')
    } catch {
      return
    }
    applyScreenshotDual()
  }, [applyScreenshotDual])

  const remotePathRef = useRef<HTMLInputElement>(null)
  const remoteOpenedFor = useRef<string | null>(null)
  const queueReady = useRef(false)

  const [tasks, setTasks] = useState<TransferTask[]>([])
  const [queueOpen, setQueueOpen] = useState(true)
  const queuePanelRef = useRef<HTMLDivElement>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  // D75: name search under the current remote folder
  const [treeOpen, setTreeOpen] = useState(false)
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
  const batchDoneRef = useRef(0)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const policyRef = useRef<ConflictChoice | null>(null)

  const visible = (entries: SftpListEntry[]) => (showHidden ? entries : entries.filter((e) => !e.name.startsWith('.')))
  const localShown = useMemo(
    () =>
      sortSftpEntries(
        visible(localEntries).filter((e) => sftpNameFilterMatch(e.name, nameFilter)),
        sortMode,
        sortFlip
      ),
    [localEntries, showHidden, nameFilter, sortMode, sortFlip]
  )
  const remoteShown = useMemo(
    () =>
      sortSftpEntries(
        visible(remoteEntries).filter((e) => sftpNameFilterMatch(e.name, nameFilter)),
        sortMode,
        sortFlip
      ),
    [remoteEntries, showHidden, nameFilter, sortMode, sortFlip]
  )

  const applyLocalList = useCallback((res: SftpListResult) => {
    if (shotMockRef.current) return
    setLocalCwd(res.path)
    setLocalInput(res.path)
    setLocalEntries(res.entries)
    setLocalSel({})
    setLocalError(null)
  }, [])

  const refreshLocal = useCallback(async (dir?: string) => {
    const api = window.aiss?.localFs
    if (!api) return
    setLocalLoading(true)
    setLocalError(null)
    try {
      const res = await api.list(dir || localCwd || '')
      if (res?.path) noteRecentDir(LOCAL_RECENT_KEY, res.path)
      applyLocalList(res)
    } catch (e) {
      setLocalError(friendlyErrorMessage(e))
    } finally {
      setLocalLoading(false)
    }
  }, [applyLocalList, localCwd])

  /** Typed path or drive pick: stay put and toast when the listing falls back or throws. */
  const openLocalStrict = useCallback(async (dir: string, failLabel: string) => {
    const api = window.aiss?.localFs
    if (!api) return
    const win = drivePlatform === 'win32'
    setLocalLoading(true)
    try {
      const res = await api.list(dir)
      if (!listedPathMatchesRequest(dir, res.path, win)) {
        showToast(tg('d6.fail', { drive: failLabel }))
        return
      }
      applyLocalList(res)
    } catch (e) {
      showToast(tg('d6.fail', { drive: failLabel }))
      setLocalError(friendlyErrorMessage(e))
    } finally {
      setLocalLoading(false)
    }
  }, [applyLocalList, drivePlatform])

  const refreshRemote = useCallback(async (path?: string) => {
    if (!sessionId) return
    const api = window.aiss?.sftp
    if (!api) return
    setRemoteLoading(true)
    setRemoteError(null)
    try {
      const res = await api.list(sessionId, path || remoteCwd || '/')
      if (shotMockRef.current) return
      noteRecentDir(hostKey, res.path)
      setRemoteCwd(res.path)
      setRemoteInput(res.path)
      setRemoteEntries(res.entries)
      setRemoteSel({})
    } catch (e) {
      setRemoteError(friendlyErrorMessage(e))
    } finally {
      setRemoteLoading(false)
    }
  }, [remoteCwd, sessionId, hostKey])

  useEffect(() => {
    const onGoto = (ev: Event) => {
      const sid = (ev as CustomEvent<{ sessionId: string }>).detail?.sessionId
      if (!sid || sid !== sessionId || remoteOpenedFor.current !== sessionId) return
      const p = takeSftpGoto(sid)
      if (p) void resolveGotoRef.current(p).then((t) => { if (t) void refreshRemote(t) })
    }
    window.addEventListener(SFTP_GOTO_EVENT, onGoto)
    return () => window.removeEventListener(SFTP_GOTO_EVENT, onGoto)
  }, [sessionId, refreshRemote])

  useEffect(() => {
    void (async () => {
      const home = await window.aiss?.localFs?.home?.().catch(() => '')
      await refreshLocal(home || '')
    })()
    // initial local listing only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let alive = true
    setDriveScan(true)
    void window.aiss?.localFs?.drives?.()
      .then((listing) => {
        if (!alive || !listing) return
        setDrivePlatform(listing.platform)
        setDrives(Array.isArray(listing.drives) ? listing.drives : [])
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setDriveScan(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const goRemoteHome = useCallback(async () => {
    if (!sessionId || shotMockRef.current) return
    setCwdFallback(false)
    try {
      const home = await window.aiss.sftp.home(sessionId)
      await refreshRemote(home || '/')
    } catch {
      await refreshRemote('/')
    }
  }, [refreshRemote, sessionId])

  /** P13-1: re-open remote pane at the live session cwd (pwd). */
  const goSessionCwd = useCallback(async () => {
    if (!sessionId || shotMockRef.current) return
    setCwdFallback(false)
    setRemoteOpening(true)
    try {
      let target = (await resolveTracked()) || ''
      if (!target && window.aiss?.ssh?.exec) {
        try {
          const res = await window.aiss.ssh.exec(sessionId, 'pwd', PWD_TIMEOUT_MS)
          target = cwdFromPwd(res) || ''
        } catch {
          target = ''
        }
      }
      if (!target) {
        try {
          target = (await window.aiss.sftp.home(sessionId)) || '/'
        } catch {
          target = '/'
        }
        setCwdFallback(true)
      }
      await refreshRemote(target || '/')
    } finally {
      setRemoteOpening(false)
    }
  }, [refreshRemote, sessionId])

  useEffect(() => {
    if (!sessionId) return
    if (shotMockRef.current) return
    if (remoteOpenedFor.current === sessionId) return
    let cancel = false
    void (async () => {
      if (shotMockRef.current) return
      setRemoteLoading(true)
      setRemoteError(null)
      let target = ''
      let failedCwd = false
      const goto = takeSftpGoto(sessionId)
      if (goto) target = (await resolveGotoRef.current(goto)) || ''
      if (!target && alignSessionCwd) target = (await resolveTracked()) || ''
      if (cancel) return
      if (alignSessionCwd && !target && window.aiss?.ssh?.exec) {
        setRemoteOpening(true)
        try {
          const res = await window.aiss.ssh.exec(sessionId, 'pwd', PWD_TIMEOUT_MS)
          const cwd = cwdFromPwd(res)
          if (cancel) return
          if (cwd) target = cwd
          else failedCwd = true
        } catch {
          failedCwd = true
        } finally {
          if (!cancel) setRemoteOpening(false)
        }
      }
      if (!target) {
        try {
          target = (await window.aiss.sftp.home(sessionId)) || '/'
        } catch {
          target = '/'
        }
      }
      if (cancel) return
      remoteOpenedFor.current = sessionId
      await refreshRemote(target)
      if (!cancel && failedCwd) setCwdFallback(true)
    })()
    return () => {
      cancel = true
    }
    // Open once per session. A later focus of this tab must not reset the path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, alignSessionCwd])

  // D12: follow the terminal's cd (manual browsing stays until the next cd)
  useEffect(() => {
    if (!sessionId || !follow) return
    let seq = 0
    const onCwd = (e: Event) => {
      const d = (e as CustomEvent<{ sessionId: string }>).detail
      if (d?.sessionId !== sessionId || shotMockRef.current || remoteOpenedFor.current !== sessionId) return
      const mine = ++seq
      void resolveTracked().then((t) => {
        if (mine !== seq || !t || t === remoteCwdRef.current) return
        // D12b: probe first; permission denied / missing (sudo -i, containers, chroot) keeps the current listing
        void window.aiss.sftp
          .list(sessionId, t)
          .then((res) => {
            if (mine !== seq || shotMockRef.current) return
            setCwdFallback(false)
            setFollowNote(null)
            setRemoteError(null)
            setRemoteCwd(res.path)
            setRemoteInput(res.path)
            setRemoteEntries(res.entries)
            setRemoteSel({})
          })
          .catch((err) => {
            if (mine !== seq) return
            const kind = followFailure(err)
            if (kind) setFollowNote({ kind, path: t })
            else void refreshRemote(t)
          })
      })
    }
    window.addEventListener(SESSION_CWD_EVENT, onCwd)
    return () => {
      seq += 1
      window.removeEventListener(SESSION_CWD_EVENT, onCwd)
    }
  }, [sessionId, follow, resolveTracked, refreshRemote])

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < NARROW_PANE_PX))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onResize = () => {
      setWinW(window.innerWidth)
      setWinH(window.innerHeight)
    }
    const onPref = () => setDensityPref(loadSftpDensity())
    window.addEventListener('resize', onResize)
    window.addEventListener(SFTP_DENSITY_EVENT, onPref)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener(SFTP_DENSITY_EVENT, onPref)
    }
  }, [])

  const persist = useCallback((next: TransferTask[]) => {
    const stored = recallTransferQueue() ?? []
    const merged = mergeHostQueue(stored, next, hostKey)
    rememberTransferQueue(merged)
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(merged))
    } catch {
      /* ignore */
    }
    void window.aiss?.sftp?.queueSave?.(merged).catch(() => undefined)
  }, [hostKey])

  useEffect(() => {
    if (!queueReady.current) return
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
        // D51: one toast when the queue drains, with the next step for the last file
        batchDoneRef.current += 1
        window.setTimeout(() => {
          const busy = tasksRef.current.some((t) => t.id !== task.id && (t.status === 'queued' || t.status === 'running'))
          if (busy || batchDoneRef.current === 0) return
          const n = batchDoneRef.current
          batchDoneRef.current = 0
          const msg = n > 1 ? tg('d51.doneN', { n }) : tg(task.direction === 'download' ? 'd51.downloaded' : 'd51.uploaded', { name: task.name })
          const actions =
            task.direction === 'download'
              ? [{ label: tg('d1.reveal'), run: () => void window.aiss.localFs.reveal(task.localPath) }]
              : onCdInTerminal
                ? [{ label: tg('d28.btn'), run: () => onCdInTerminal(parentPath(task.remotePath)) }]
                : []
          showToast(msg, { ms: 6000, actions })
        }, 0)
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
  // D9: one click for every failed / interrupted transfer (sequential, each keeps its resume offset)
  const [retryingAll, setRetryingAll] = useState(false)
  const retryAll = useCallback(async () => {
    const list = retryableTransfers(tasks)
    if (!list.length) return
    setRetryingAll(true)
    try {
      for (const t of list) await resumeRef.current(t)
    } finally {
      setRetryingAll(false)
    }
  }, [tasks])
  // D9: files dropped on this session's terminal
  const transferFilesRef = useRef<typeof transferFiles | null>(null)
  transferFilesRef.current = transferFiles
  useEffect(() => {
    if (!sessionId) return
    const take = () => {
      const p = takePendingUpload(sessionId)
      if (!p) return
      void (async () => {
        const home = p.dir.startsWith('/') ? null : await window.aiss.sftp.home(sessionId).catch(() => null)
        const dir = resolveHomePath(p.dir, home) ?? remoteCwdRef.current
        await transferFilesRef.current?.(
          'upload',
          p.paths.map((lp) => ({ name: baseName(lp), localPath: lp, remotePath: joinPosix(dir, baseName(lp)), size: 0 }))
        )
        showToast(tg('d9.dropQueued', { n: p.paths.length, dir }))
      })()
    }
    take()
    window.addEventListener(PENDING_UPLOAD_EVENT, take)
    return () => window.removeEventListener(PENDING_UPLOAD_EVENT, take)
  }, [sessionId])

  useEffect(() => {
    let alive = true
    void (async () => {
      let loaded: TransferTask[] = recallTransferQueue() ?? []
      if (!loaded.length) {
        try {
          const remote = await window.aiss?.sftp?.queueLoad?.()
          if (Array.isArray(remote) && remote.length) loaded = hydrateQueue(remote)
        } catch {
          /* ignore */
        }
      }
      if (!loaded.length) {
        try {
          loaded = hydrateQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'))
        } catch {
          loaded = []
        }
      }
      if (!alive) return
      rememberTransferQueue(loaded)
      const mine = hostKey ? loaded.filter((t) => t.hostKey === hostKey) : loaded
      queueReady.current = true
      setTasks(mine)
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
    const key = tabId || hostKey || 'sftp'
    registerSftpCloseGuard(key, async () => {
      if (active <= 0) return 'close'
      return await new Promise<'close' | 'cancel-close' | 'stay'>((resolve) => {
        const onAnswer = (e: Event) => {
          const d = (e as CustomEvent<{ tabId?: string; answer?: 'close' | 'cancel-close' | 'stay' }>).detail
          if (d?.tabId && d.tabId !== key) return
          window.removeEventListener('aiss-sftp-close-answer', onAnswer)
          resolve(d?.answer || 'stay')
        }
        window.addEventListener('aiss-sftp-close-answer', onAnswer)
        window.dispatchEvent(new CustomEvent('aiss-sftp-close-ask', { detail: { tabId: key, n: active } }))
      })
    })
    return () => registerSftpCloseGuard(key, null)
  }, [tasks, tabId, hostKey])

  const [closeAsk, setCloseAsk] = useState<number | null>(null)
  useEffect(() => {
    const key = tabId || hostKey || 'sftp'
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<{ tabId?: string; n?: number }>).detail
      if (!d || d.tabId !== key) return
      setCloseAsk(d.n || 1)
    }
    window.addEventListener('aiss-sftp-close-ask', onAsk)
    return () => window.removeEventListener('aiss-sftp-close-ask', onAsk)
  }, [tabId, hostKey])
  const answerClose = (v: 'close' | 'cancel-close' | 'stay') => {
    const key = tabId || hostKey || 'sftp'
    setCloseAsk(null)
    window.dispatchEvent(new CustomEvent('aiss-sftp-close-answer', { detail: { tabId: key, answer: v } }))
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
    if (readOnly || remoteWritesBlocked) return
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
    if (readOnly || remoteWritesBlocked) return false
    if (!beforeRemoteWrite) return true
    return beforeRemoteWrite()
  }

  // D93: permissions via SFTP chmod; read-only / write guard first, then old → new confirm
  const chmodEntry = async (entry: SftpListEntry) => {
    if (!sessionId || !(await allowRemoteWrite())) return
    const cur = permBits(entry.mode)
    if (cur == null) return showToast(tg('d93.noMode'))
    const text = await askText(tg('d93.ask', { name: entry.name }), toOctal(cur))
    if (text == null) return
    const next = parseMode(text, cur)
    if (next == null) return showToast(tg('d93.invalid'), { kind: 'error' })
    if (next === cur) return showToast(tg('d93.same'))
    const ok = await confirmDialog({
      title: tg('d93.confirmTitle', { name: entry.name }),
      body: `${toOctal(cur)} ${toRwx(cur)}  →  ${toOctal(next)} ${toRwx(next)}`,
      confirmText: tg('d93.apply')
    })
    if (!ok) return
    try {
      await window.aiss.sftp.chmod(sessionId, entry.path, next)
      showToast(tg('d93.done', { mode: toOctal(next) }))
      await refreshRemote(remoteCwd)
    } catch (err) {
      showToast(tg('d93.fail', { reason: String((err as Error)?.message ?? err) }), { kind: 'error' })
    }
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

  // D71: new empty remote file, then open it in the editor; never overwrites
  const newRemoteFile = async () => {
    if (!sessionId || !(await allowRemoteWrite())) return
    const name = await askText(tg('d71.name'))
    if (name == null) return
    const problem = newFileProblem(name, remoteEntries.map((e) => e.name))
    if (problem) {
      if (problem !== 'empty') showToast(tg(`d71.${problem}` as 'd71.exists', { name: name.trim() }), { kind: 'error' })
      return
    }
    const path = joinPosix(remoteCwd, name.trim())
    try {
      // re-check on the server in case the listing is stale
      const st = await window.aiss.sftp.stat(sessionId, path).catch(() => null)
      if (st) {
        showToast(tg('d71.exists', { name: name.trim() }), { kind: 'error' })
        return
      }
      await window.aiss.sftp.writeText(sessionId, path, '')
    } catch (err) {
      showToast(tg('d71.fail', { msg: err instanceof Error ? err.message : String(err) }), { kind: 'error' })
      return
    }
    await refreshRemote(remoteCwd)
    onOpenRemoteFile?.({ remotePath: path, name: name.trim(), size: 0 })
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

  useEffect(() => {
    const onFocus = (ev: Event) => {
      const sid = (ev as CustomEvent<{ sessionId?: string | null }>).detail?.sessionId
      if (sid && sessionId && sid !== sessionId) return
      setQueueOpen(true)
      window.requestAnimationFrame(() => {
        queuePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        const title = queuePanelRef.current?.querySelector('.sftp-transfers-title') as HTMLElement | null
        title?.focus?.()
      })
    }
    window.addEventListener('aiss-sftp-focus-queue', onFocus)
    return () => window.removeEventListener('aiss-sftp-focus-queue', onFocus)
  }, [sessionId])

  const summary = queueSummary(tasks)
  const finishedCount = countFinishedTransfers(tasks)
  const groupedTransfers = useMemo(() => {
    const groups = groupTransferTasks(tasks)
    let left = 20
    const out: { key: TransferGroupKey; tasks: TransferTask[] }[] = []
    for (const g of groups) {
      if (left <= 0) break
      const slice = g.tasks.slice(0, left)
      left -= slice.length
      out.push({ key: g.key, tasks: slice })
    }
    return out
  }, [tasks])
  const groupLabel = (key: TransferGroupKey) =>
    key === 'active'
      ? tg('d1.groupActive')
      : key === 'paused'
        ? tg('d1.groupPaused')
        : key === 'failed'
          ? tg('d1.groupFailed')
          : tg('d1.groupFinished')
  const showLocal = !narrow || pane === 'local'
  const showRemote = !narrow || pane === 'remote'

  /** D36: large or binary files: offer a download instead of a truncated / failing editor (double-click and Enter) */
  const openRemoteEntry = (e: SftpListEntry) => {
    if (!onOpenRemoteFile) return
    const how = openDecision(e.name, e.size)
    const open = () => onOpenRemoteFile({ remotePath: e.path, name: e.name, size: e.size })
    if (how === 'edit') {
      open()
      return
    }
    const download = () =>
      void transferFiles('download', [{ name: e.name, localPath: joinLocal(localCwd, e.name), remotePath: e.path, size: e.size, mtime: e.modifyTime }])
    showToast(tg(how === 'binary' ? 'd36.binary' : 'd36.large', { name: e.name, size: formatBytes(e.size) }), {
      ms: 10000,
      actions: how === 'binary' ? [{ label: tg('d36.download'), run: download }] : [{ label: tg('d36.download'), run: download }, { label: tg('d36.openAnyway'), run: open }]
    })
  }

  /** D58: local file → default app after a confirm; executables/scripts only get "show in folder" */
  const openLocalEntry = async (e: SftpListEntry) => {
    const reveal = () => void window.aiss.localFs.reveal(e.path)
    if (isRunnableName(e.name) || !window.aiss.localFs.open) {
      showToast(tg('d58.runnable', { name: e.name }), { ms: 8000, actions: [{ label: tg('d1.reveal'), run: reveal }] })
      return
    }
    const ok = await confirmDialog({ title: tg('d58.title', { name: e.name }), body: e.path, confirmText: tg('d58.open') })
    if (!ok) return
    const r = await window.aiss.localFs.open(e.path).catch((err: unknown) => String((err as Error)?.message ?? err))
    if (r !== 'ok') showToast(tg('d58.fail', { reason: r }), { kind: 'error', actions: [{ label: tg('d1.reveal'), run: reveal }] })
  }

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
    // D55: ArrowUp/Down move the selection (Shift extends it)
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && entries.length) {
      e.preventDefault()
      const at = entries.findIndex((en) => selected[en.path])
      const next = at < 0 ? 0 : Math.max(0, Math.min(entries.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
      const path = entries[next]!.path
      const setSel = side === 'local' ? setLocalSel : setRemoteSel
      setSel(e.shiftKey ? { ...selected, [path]: true } : { [path]: true })
      const rows = (e.currentTarget as HTMLElement).querySelectorAll('tbody tr')
      ;(rows[next] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
      return
    }
    // D100: Ctrl+A selects every visible row; typing letters jumps to the first matching name
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a' && entries.length) {
      e.preventDefault()
      const setSel = side === 'local' ? setLocalSel : setRemoteSel
      setSel(Object.fromEntries(entries.map((en) => [en.path, true])))
      showToast(tg('d100.selectedAll', { n: entries.length }))
      return
    }
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && entries.length) {
      const now = Date.now()
      const ta = typeAheadRef.current
      ta.text = now - ta.at > 800 ? e.key : ta.text + e.key
      ta.at = now
      const at = entries.findIndex((en) => selected[en.path])
      const hit = typeAheadIndex(entries.map((en) => ({ label: en.name })), ta.text, at)
      if (hit >= 0) {
        e.preventDefault()
        const setSel = side === 'local' ? setLocalSel : setRemoteSel
        setSel({ [entries[hit]!.path]: true })
        const rows = (e.currentTarget as HTMLElement).querySelectorAll('tbody tr')
        ;(rows[hit] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
      }
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
      } else if (side === 'remote') openRemoteEntry(current)
      else void openLocalEntry(current)
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

  const switchDrive = (id: string) => {
    const drive = drives.find((d) => d.id === id)
    if (!drive) return
    if (!drive.ready) {
      showToast(tg('d6.fail', { drive: drive.label || drive.id }))
      return
    }
    void openLocalStrict(drive.root, drive.label || drive.id)
  }

  const renderPane = (side: PaneId) => {
    const isLocal = side === 'local'
    const cwd = isLocal ? localCwd : remoteCwd
    const input = isLocal ? localInput : remoteInput
    const setInput = isLocal ? setLocalInput : setRemoteInput
    const entries = isLocal ? localShown : remoteShown
    const loading = isLocal ? localLoading : remoteLoading || remoteOpening
    const error = isLocal ? localError : remoteError
    const selected = isLocal ? localSel : remoteSel
    const setSelected = isLocal ? setLocalSel : setRemoteSel
    const disconnected = !isLocal && connected === false && !pendingConnect && !shotMock
    const unconnected = !isLocal && !sessionId && !pendingConnect && !shotMock
    const showPath = !compact || crumbOpen
    const selectedDrive = isLocal ? selectedDriveId(drives, localCwd, drivePlatform) : ''
    const driveValue = drives.some((d) => d.id === selectedDrive) ? selectedDrive : drives[0]?.id ?? ''
    const driveControl = isLocal ? (
      <label className={`sftp-drive${centerLayout.driveProminent ? ' is-prominent' : ''}`}>
        <span className="sr-only">{tg('d6.drive')}</span>
        <select
          data-testid="sftp-drive-switch"
          aria-label={tg('d6.switch')}
          title={tg('d6.switch')}
          value={driveScan && drives.length === 0 ? '' : driveValue}
          onChange={(e) => switchDrive(e.target.value)}
        >
          {driveScan && drives.length === 0 ? <option value="">{tg('d6.scanning')}</option> : null}
          {drives.map((d) => (
            <option
              key={d.id}
              value={d.id}
              disabled={!d.ready}
              title={d.ready ? tg('d6.root', { letter: d.id.replace(/:$/, '') }) : tg('d6.unavailable')}
            >
              {d.ready ? d.label : `${d.label} · ${tg('d6.unavailable')}`}
            </option>
          ))}
        </select>
      </label>
    ) : null
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
            <span className="sftp-pane-name">{isLocal ? tg('d1.local') : `${tg('d1.remote')}${hostLabel ? ` · ${hostLabel}` : ''}`}</span>
            {isLocal && !showPath ? driveControl : null}
            {isLocal || hostKey ? (
              <button
                type="button"
                className="sftp-cd-terminal"
                data-testid={isLocal ? 'sftp-recent-dirs-local' : 'sftp-recent-dirs'}
                title={tg(isLocal ? 'd47.tip' : 'd45.tip')}
                onClick={(ev) => {
                  // D45: recent folders on this host
                  const dirs = recentDirs(isLocal ? LOCAL_RECENT_KEY : hostKey).filter((d) => d !== cwd)
                  if (!dirs.length) {
                    showToast(tg('d45.empty'))
                    return
                  }
                  openContextMenu(ev, dirs.map((d, i) => ({ id: `recent-${i}`, label: d, onSelect: () => void (isLocal ? refreshLocal(d) : refreshRemote(d)) })))
                }}
              >
                {tg('d45.btn')}
              </button>
            ) : null}
            {!isLocal && onCdInTerminal && cwd ? (
              <button type="button" className="sftp-cd-terminal" data-testid="sftp-cd-terminal" title={tg('d28.tip')} onClick={() => onCdInTerminal(cwd)}>
                {tg('d28.btn')}
              </button>
            ) : null}
            {compact ? (
              <button type="button" className="sftp-crumb-toggle" onClick={() => setCrumbOpen((v) => !v)}>
                {tg('ux46.crumb')}
              </button>
            ) : null}
          </div>
          {showPath ? (
          <div className="sftp-pathbar">
            {driveControl}
            <button type="button" onClick={() => (isLocal ? void refreshLocal(parentLocal(cwd)) : void refreshRemote(parentPosix(cwd)))} disabled={!cwd || cwd === '/' || (isLocal && /^[A-Za-z]:\\?$/.test(cwd))}>
              {tg('sftp.up')}
            </button>
            <nav className="sftp-crumbs" aria-label={isLocal ? tg('d1.localPath') : tg('sftp.remotePath')} data-testid={isLocal ? 'sftp-local-crumbs' : 'sftp-remote-crumbs'}>
              {pathCrumbs(cwd, isLocal).map((c, i, arr) => (
                <span key={c.path + i} className="sftp-crumb-wrap">
                  {i > 0 && arr[i - 1]!.label !== '/' ? <span className="sftp-crumb-sep" aria-hidden>/</span> : null}
                  <button
                    type="button"
                    className={`sftp-crumb${i === arr.length - 1 ? ' is-current' : ''}`}
                    disabled={i === arr.length - 1 || disconnected || (!isLocal && !sessionId)}
                    title={c.path}
                    onClick={() => {
                      if (isLocal) void openLocalStrict(c.path, c.path)
                      else void refreshRemote(c.path)
                    }}
                  >
                    {c.label}
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="sftp-copy-path"
                data-testid={isLocal ? 'sftp-copy-local-path' : 'sftp-copy-remote-path'}
                title={tg('sftp.copyPath')}
                aria-label={tg('sftp.copyPath')}
                onClick={() => {
                  void navigator.clipboard.writeText(cwd).then(() => showToast(tg('sftp.copiedPath', { path: cwd })))
                }}
              >
                {tg('sftp.copyPath')}
              </button>
            </nav>
            <input
              ref={isLocal ? undefined : remotePathRef}
              data-testid={isLocal ? 'sftp-local-path-input' : 'sftp-remote-path-input'}
              value={input}
              aria-label={isLocal ? tg('d1.localPath') : tg('sftp.remotePath')}
              spellCheck={false}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation()
                  const next = normalizeGotoPath(input, isLocal ? 'local' : 'remote')
                  setInput(next)
                  if (isLocal) void openLocalStrict(next, next)
                  else void refreshRemote(next)
                }
              }}
            />
            <button
              type="button"
              data-testid={isLocal ? 'sftp-local-go-path' : 'sftp-remote-go-path'}
              title={tg('sftp.goPath')}
              onClick={() => {
                const next = normalizeGotoPath(input, isLocal ? 'local' : 'remote')
                setInput(next)
                if (isLocal) void openLocalStrict(next, next)
                else void refreshRemote(next)
              }}
            >
              {tg('sftp.goPath')}
            </button>
            <button type="button" onClick={() => (isLocal ? void refreshLocal(cwd) : void refreshRemote(cwd))}>
              {tg('sftp.refresh')}
            </button>
            {isLocal ? (
              <button type="button" onClick={() => void mkdir(side)}>
                {tg('sftp.mkdir')}
              </button>
            ) : (
              // D76: one "New ▾" menu for folder / file keeps the remote toolbar on one row
              <button
                type="button"
                data-testid="sftp-remote-new"
                aria-haspopup="menu"
                title={readOnly ? roTitle : remoteWritesBlocked ? tg('l4.readonlyBlocked') : tg('d76.newTip')}
                disabled={readOnly || remoteWritesBlocked || !sessionId}
                onClick={(ev) => {
                  const r = ev.currentTarget.getBoundingClientRect()
                  openContextMenu(ev, [
                    { id: 'mkdir', label: tg('sftp.mkdir'), onSelect: () => void mkdir(side) },
                    { id: 'newfile', label: tg('d71.button'), onSelect: () => void newRemoteFile() }
                  ], { anchor: { x: r.left, y: r.bottom + 2 } })
                }}
              >
                {tg('d76.new')}
              </button>
            )}
            {!isLocal ? (
              <button type="button" className="sftp-icon-btn" data-testid="sftp-remote-tree-search" title={tg('d75.tip')} aria-label={tg('d75.button')} disabled={!sessionId} onClick={() => setTreeOpen(true)}>
                <Icon name="search" size={14} />
              </button>
            ) : null}
            <input
              type="search"
              className="sftp-name-filter"
              data-testid={isLocal ? 'sftp-local-name-filter' : 'sftp-remote-name-filter'}
              value={nameFilter}
              placeholder={tg('sftp.nameFilter')}
              aria-label={tg('sftp.nameFilter')}
              onChange={(e) => setNameFilter(e.target.value)}
            />
            {nameFilter.trim() ? (
              <button
                type="button"
                data-testid="sftp-clear-name-filter"
                title={tg('sftp.clearNameFilter')}
                aria-label={tg('sftp.clearNameFilter')}
                onClick={() => setNameFilter('')}
              >
                ×
              </button>
            ) : null}
            <button
              type="button"
              data-testid="sftp-sort-mode"
              className={sortMode === 'mtime' ? 'is-on' : ''}
              title={tg(sortMode === 'mtime' ? 'sftp.sortByMtimeTip' : 'sftp.sortByNameTip')}
              onClick={() => {
                setSortMode((m) => (m === 'name' ? 'mtime' : 'name'))
                setSortFlip(false)
              }}
            >
              <span className="sftp-label">{tg(sortMode === 'mtime' ? 'sftp.sortMtime' : sortMode === 'size' ? 'd81.sortSize' : 'sftp.sortName')}</span>
            </button>
            <button type="button" className={showHidden ? 'is-on sftp-icon-btn' : 'sftp-icon-btn'} data-testid={isLocal ? 'sftp-local-hidden' : 'sftp-remote-hidden'} aria-pressed={showHidden} aria-label={tg('d1.hidden')} onClick={() => setShowHidden((v) => !v)} title={tg('d1.hidden')}>
              <span className="sftp-label sftp-label-keep">{tg('d76.hiddenShort')}</span>
            </button>
          </div>
          ) : null}
        </div>
        {!isLocal && remoteOpening ? (
          <div className="sftp-opening" data-testid="sftp-opening">{tg('d7.opening')}</div>
        ) : null}
        {!isLocal && pendingConnect && !shotMock ? (
          <div className="sftp-opening" data-testid="sftp-connecting">{tg('d8.connecting')}</div>
        ) : null}
        {!isLocal && followNote ? (
          <div className="sftp-cwd-fallback sftp-follow-note" data-testid="sftp-follow-note" role="status">
            <span>{tg(followNote.kind === 'denied' ? 'd12b.denied' : 'd12b.missing', { path: followNote.path, cwd: remoteCwd || '/' })}</span>
            <button type="button" aria-label={tg('common.close')} onClick={() => setFollowNote(null)}>×</button>
          </div>
        ) : null}
        {!isLocal && cwdFallback ? (
          <div className="sftp-cwd-fallback" data-testid="sftp-cwd-fallback" role="status">
            <span>{tg('d7.fallback')}</span>
            <button
              type="button"
              onClick={() => {
                setCwdFallback(false)
                remotePathRef.current?.focus()
                remotePathRef.current?.select()
              }}
            >
              {tg('d7.goto')}
            </button>
            <button type="button" onClick={() => void goRemoteHome()}>{tg('d7.home')}</button>
            <button type="button" aria-label={tg('common.close')} onClick={() => setCwdFallback(false)}>×</button>
          </div>
        ) : null}
        {error && !disconnected ? (
          !isLocal && (noticeKind(error) === 'dropped' || noticeKind(error) === 'unreachable' || noticeKind(error) === 'auth') ? (
            <ConnectTrouble
              raw={error}
              host={hostLabel || sessionTitle || ''}
              onEdit={() => onPickHost?.()}
              onRetry={() => {
                if (onReconnect) onReconnect()
                else void refreshRemote(remoteCwd)
              }}
            />
          ) : (
            <ErrorNotice
              testId="sftp-error"
              message={noticeKind(error) === 'permission' ? tg('pf5.sftpPerm') : error}
              detail={noticeKind(error) === 'permission' ? error : null}
              actions={
                !isLocal ? (
                  <>
                    <button type="button" onClick={() => void refreshRemote(parentPosix(remoteCwd))}>{tg('pf5.up')}</button>
                    <button type="button" onClick={() => remotePathRef.current?.focus()}>{tg('pf5.changePath')}</button>
                  </>
                ) : (
                  <button type="button" onClick={() => void refreshLocal()}>{tg('pf5.retry')}</button>
                )
              }
            />
          )
        ) : null}
        <div className={`sftp-browser${disconnected ? ' is-disconnected' : ''}`}>
          {unconnected ? (
            <EmptyState
              testId="sftp-unconnected"
              icon="sftp"
              title={tg('pf4.sftpTitle')}
              desc={tg('pf4.sftpDesc')}
              primary={{ label: tg('pf4.pickHost'), onClick: () => onPickHost?.(), testId: 'sftp-pick-host' }}
            />
          ) : (
          <>
          {disconnected ? (
            <EmptyState
              compact
              testId="sftp-disconnected"
              icon="sftp"
              title={disconnectStatusSentence(hostLabel || sessionTitle || '', locale === 'en' ? 'en' : 'zh-CN')}
              desc={tg('sftp.disconnectDesc')}
              primary={
                onReconnect
                  ? { label: tg('d1.reconnect'), onClick: () => onReconnect(), testId: 'sftp-reconnect' }
                  : undefined
              }
            />
          ) : null}
          {(loading || (pendingConnect && !shotMock)) && entries.length === 0 ? (
            <div className="sftp-skel" data-testid="sftp-skel">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="sftp-skel-row" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              compact
              testId={
                nameFilter.trim()
                  ? isLocal
                    ? 'sftp-local-filter-empty'
                    : 'sftp-filter-empty'
                  : isLocal
                    ? 'sftp-local-empty'
                    : 'sftp-empty'
              }
              icon={readOnly && !isLocal ? <Icon name="lock" strokeWidth={1.5} /> : 'sftp'}
              title={
                nameFilter.trim()
                  ? tg('sftp.filterEmptyTitle')
                  : readOnly && !isLocal
                    ? tg('ux34.emptyTitle')
                    : tg('ux08.sftpTitle')
              }
              desc={
                nameFilter.trim()
                  ? tg('sftp.filterEmptyDesc', { q: nameFilter.trim() })
                  : readOnly && !isLocal
                    ? tg('ux34.emptyDesc')
                    : tg('ux08.sftpDesc')
              }
            />
          ) : (
            <table className="sftp-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  {(['name', 'size', 'mtime'] as const).map((col) => {
                    const on = sortMode === col
                    const desc = sortIsDesc(col, on ? sortFlip : false)
                    return (
                      <th
                        key={col}
                        style={col === 'size' ? { width: 72 } : col === 'mtime' ? { width: 132 } : undefined}
                        aria-sort={on ? (desc ? 'descending' : 'ascending') : 'none'}
                      >
                        <button
                          type="button"
                          className={`sftp-th-sort${on ? ' is-on' : ''}`}
                          data-testid={`sftp-th-${col}`}
                          title={tg('d81.sortTip')}
                          onClick={() => {
                            const n = nextSort({ mode: sortMode, flip: sortFlip }, col)
                            setSortMode(n.mode)
                            setSortFlip(n.flip)
                          }}
                        >
                          {tg(col === 'name' ? 'sftp.colName' : col === 'size' ? 'sftp.colSize' : 'sftp.colTime')}
                          {on ? <span className="sftp-th-arrow" aria-hidden>{desc ? '↓' : '↑'}</span> : null}
                        </button>
                      </th>
                    )
                  })}
                  {!isLocal ? <th style={{ width: 84 }}>{tg('d1.perm')}</th> : null}
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
                      } else if (!isLocal) openRemoteEntry(e)
                      else void openLocalEntry(e)
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
                      if (isLocal || (!onCompare && !onOpenHistory && !sessionId)) return
                      openContextMenu(ev, [
                        ...(sessionId
                          ? [{
                          // D39: prefill the AI composer with this file (redacted, capped); the user still presses send
                          id: 'ask-ai-file',
                          label: tg('d39.ask'),
                          onSelect: () => {
                            const chk = canAttachFile(e.path, e.size)
                            if (!chk.ok) {
                              showToast(tg(chk.reason === 'secret' ? 'd39.secret' : chk.reason === 'binary' ? 'd39.binary' : 'd39.large'))
                              return
                            }
                            void window.aiss.sftp.readText(sessionId, e.path, AI_FILE_MAX_BYTES).then(
                              (r) => {
                                const c = buildFileContext(e.path, r.content, r.truncated || r.size > AI_FILE_MAX_BYTES)
                                if (requestAskWithContext(sessionId, c.text, tg('d39.q', { name: e.name })))
                                  showToast(c.redacted ? tg('d39.prefilledRedacted', { n: c.redacted }) : tg('d39.prefilled'))
                                else showToast(tg('d39.empty'))
                              },
                              (err: unknown) => showToast(tg('d39.readFail', { reason: String((err as Error)?.message ?? err) }))
                            )
                          }
                        }]
                          : []),
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
                        ...(sessionId
                          ? [{
                          id: 'chmod',
                          label: tg('d93.menu'),
                          disabled: readOnly || remoteWritesBlocked || permBits(e.mode) == null,
                          title: readOnly ? roTitle : remoteWritesBlocked ? tg('l4.readonlyBlocked') : undefined,
                          onSelect: () => void chmodEntry(e)
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
                        className={`sftp-name-btn${e.isDirectory ? ' is-dir' : ''}${e.link ? ' is-link' : ''}${e.link === 'broken' ? ' is-broken' : ''}`}
                        title={e.link ? tg(e.link === 'broken' ? 'd12b.linkBroken' : 'd12b.link') : undefined}
                        data-link={e.link}
                        onClick={() => {
                          if (e.link === 'broken') return
                          if (e.isDirectory) {
                            if (isLocal) void refreshLocal(e.path)
                            else void refreshRemote(e.path)
                          } else if (!isLocal && onOpenRemoteFile && (isLikelyTextFile(e.name) || true)) {
                            onOpenRemoteFile({ remotePath: e.path, name: e.name, size: e.size })
                          }
                        }}
                      >
                        {e.isDirectory ? <Icon name="folder" size={14} /> : <Icon name="file-text" size={14} />}{' '}
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
          </>
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
        // D67: a conflict resolved as "keep target" copies the newer target back to the source side
        const dir = row.reverse ? (plan.direction === 'upload' ? 'download' : 'upload') : plan.direction
        if (dir === 'upload' && row.kind === 'changed' && sessionId) {
          const snap = await captureRemoteSnapshot({ sessionId, profileId, path: remotePath, source: 'sync' })
          if (snap === 'kept') kept += 1
          else if (snap === 'skipped') skipped += 1
        }
        await enqueueFile(dir, localPath, remotePath, baseName(row.rel))
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
      className={`workspace-panel workspace-panel--sftp sftp-dual${compact ? ' is-compact' : ''}${centerLayout.advancedCollapsed ? ' is-center-quiet' : ''}`}
      ref={rootRef}
      data-testid="sftp-dual"
      data-screenshot-mock={shotMock ? "1" : undefined}
      data-sftp-center-layout={centerLayout.advancedCollapsed ? 'quiet' : 'wide'}
      data-sftp-drive={centerLayout.driveProminent ? 'prominent' : 'normal'}
      role="region"
      aria-label={`${tg('sftp.title')}${sessionTitle ? ` · ${sessionTitle}` : ''}`}
    >
      <PanelHeader
        className="sftp-toolbar"
        testId="sftp-toolbar"
        actionsClassName="sftp-toolbar-actions"
        actionsProps={{ 'data-nowrap': centerLayout.toolbarNowrap ? '1' : '0' }}
        actions={
          <>
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
            <button
              type="button"
              className="sftp-session-cwd"
              data-testid="sftp-session-cwd"
              disabled={!sessionId}
              title={tg('d7.sessionCwdTip')}
              onClick={() => void goSessionCwd()}
            >
              <span className="sftp-label sftp-label-keep">{tg('d7.sessionCwd')}</span>
            </button>
            <button
              type="button"
              className="sftp-compare-open"
              data-testid="sftp-compare-open"
              disabled={!sessionId}
              title={tg('d62.compareTip')}
              onClick={() => { setSyncProfile(null); setSyncOpen(true) }}
            >
              <span className="sftp-label sftp-label-keep">{tg('d62.compare')}</span>
            </button>
            <label className="sftp-follow" title={tg('d12.followTip')}>
              <input type="checkbox" data-testid="sftp-follow-cwd" checked={follow} disabled={!sessionId}
                onChange={(e) => {
                  const v = e.currentTarget.checked
                  try { if (v) localStorage.removeItem(SFTP_FOLLOW_KEY); else localStorage.setItem(SFTP_FOLLOW_KEY, '0') } catch { /* ignore */ }
                  setFollow(v)
                  if (v) void goSessionCwd()
                }} />
              <span className="sftp-label sftp-label-keep">{tg('d12.follow')}</span>
            </label>
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
            <span className="sftp-queue-summary">
              {summary.active > 0 ? tg('d1.summary', { n: summary.active, speed: formatSpeed(summary.speed) }) : tg('d1.queue')}
            </span>
            <details
              className="sftp-advanced"
              data-testid="sftp-advanced"
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>{tg('sftp.advanced')}</summary>
              <div className="sftp-advanced-body">
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
              </div>
            </details>
          </>
        }
      />
      <div className={`sftp-panes${narrow ? ' is-narrow' : ''}`} data-sftp-split={centerLayout.listPreviewSplit ? 'clear' : 'flat'}>
        {showLocal ? renderPane('local') : null}
        {!narrow ? (
          <div className="sftp-mid">
            <button type="button" data-testid="sftp-upload" disabled={!sessionId || readOnly || remoteWritesBlocked || !localShown.some((e) => localSel[e.path] && !e.isDirectory)} title={remoteWritesBlocked ? tg('s4.sftpDisabled') : roTitle} onClick={uploadSelected}>
              {tg('d1.toRemote')}
            </button>
            <button type="button" disabled={!sessionId || !remoteShown.some((e) => remoteSel[e.path] && !e.isDirectory)} onClick={downloadSelected}>
              {tg('d1.toLocal')}
            </button>
          </div>
        ) : null}
        {showRemote ? renderPane('remote') : null}
      </div>
      <div className="sftp-transfers" data-testid="sftp-queue" ref={queuePanelRef}>
        <div className="sftp-transfers-head">
          <button type="button" className="sftp-transfers-title" onClick={() => setQueueOpen((v) => !v)}>
            <Twist open={queueOpen} size={12} /> {tg('d1.queue')}
            {summary.active > 0 ? ` · ${tg('d1.summary', { n: summary.active, speed: formatSpeed(summary.speed) })}` : ''}
          </button>
          {retryableTransfers(tasks).length > 0 ? (
            <button
              type="button"
              className="sftp-transfers-clear"
              data-testid="sftp-xfer-retry-all"
              disabled={retryingAll}
              title={tg('d9.retryAllHint')}
              onClick={() => void retryAll()}
            >
              {tg('d9.retryAll', { n: retryableTransfers(tasks).length })}
            </button>
          ) : null}
          {finishedCount > 0 ? (
            <button
              type="button"
              className="sftp-transfers-clear"
              data-testid="sftp-xfer-clear-done"
              title={tg('d1.clearDone')}
              onClick={() => setTasks((prev) => clearFinishedTransfers(prev))}
            >
              {tg('d1.clearDone')}
            </button>
          ) : null}
        </div>
        {queueOpen && tasks.length === 0 ? (
          <p className="sftp-queue-empty" data-testid="sftp-queue-empty">
            {tg('d1.queueEmpty')}
          </p>
        ) : null}
        {queueOpen && tasks.length > 0 ? (
          <>
            {groupedTransfers.map((group) => (
              <ul key={group.key} className="sftp-transfer-group" data-group={group.key}>
                <li className="sftp-transfer-group-label" aria-hidden>
                  {groupLabel(group.key)}
                </li>
                {group.tasks.map((t) => {
                  const fail =
                    t.status === 'error' || (t.status === 'interrupted' && Boolean(t.error))
                      ? transferFailTone(t.error, locale === 'en' ? 'en' : 'zh-CN')
                      : null
                  const progressText =
                    t.status === 'done'
                      ? tg('sftp.done')
                      : t.status === 'cancelled'
                        ? tg('d1.cancelled')
                        : t.status === 'paused'
                          ? `${tg('d1.paused')}${formatTransferProgress(t) ? ` · ${formatTransferProgress(t)}` : ''}`
                          : t.status === 'queued'
                            ? tg('d1.queued')
                            : fail
                              ? fail.message
                              : t.status === 'interrupted'
                                ? `${tg('d1.interrupted', { pct: pctOf(t.transferred, t.total) })}${
                                    formatTransferProgress(t) ? ` · ${formatTransferProgress({ ...t, status: 'paused' })}` : ''
                                  }`
                                : formatTransferProgress(t)
                  return (
                    <li key={t.id} data-status={t.status} data-fail-kind={fail?.kind || undefined} data-testid="sftp-xfer-row">
                      <div className="sftp-transfer-meta">
                        <span>
                          {t.direction === 'upload' ? '↑' : '↓'} {t.name}
                        </span>
                        <span data-testid="sftp-xfer-progress">{progressText}</span>
                      </div>
                      {fail ? (
                        <div className="sftp-transfer-fail pf5-banner" data-testid="sftp-transfer-fail" role="status">
                          <p className="pf5-banner-msg">{fail.message}</p>
                          {fail.detail ? (
                            <details className="pf5-details">
                              <summary>{tg('pf5.details')}</summary>
                              <pre>{fail.detail}</pre>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                      <div
                        className="sftp-progress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={t.status === 'done' ? 100 : pctOf(t.transferred, t.total)}
                      >
                        <div
                          className={`sftp-progress-bar${t.status === 'error' || t.status === 'interrupted' ? ' is-error' : ''}${t.status === 'done' ? ' is-done' : ''}${t.status === 'paused' ? ' is-paused' : ''}`}
                          style={{ width: `${t.status === 'done' ? 100 : pctOf(t.transferred, t.total)}%` }}
                        />
                      </div>
                      <div className="sftp-transfer-actions">
                        {t.status === 'running' ? (
                          <button type="button" data-testid="sftp-xfer-pause" onClick={() => void window.aiss.sftp.cancel?.(t.id)}>
                            {tg('d1.pause')}
                          </button>
                        ) : null}
                        {t.status === 'paused' || t.status === 'interrupted' || t.status === 'error' ? (
                          <button type="button" className={fail ? 'primary' : undefined} data-testid="sftp-xfer-resume" onClick={() => void resumeTask(t)}>
                            {tg('d1.resume')}
                          </button>
                        ) : null}
                        {fail && (fail.kind === 'dropped' || fail.kind === 'unreachable') && onReconnect ? (
                          <button type="button" data-testid="sftp-xfer-reconnect" onClick={() => onReconnect()}>
                            {tg('d1.reconnect')}
                          </button>
                        ) : null}
                        {t.status !== 'done' && t.status !== 'cancelled' ? (
                          <button
                            type="button"
                            data-testid="sftp-xfer-cancel"
                            onClick={() => {
                              void window.aiss.sftp.cancel?.(t.id)
                              patchTask(t.id, { status: 'cancelled' })
                            }}
                          >
                            {tg('d1.cancel')}
                          </button>
                        ) : null}
                        <button type="button" data-testid="sftp-xfer-reveal" onClick={() => void window.aiss.localFs.reveal(t.localPath)}>
                          {tg('d1.reveal')}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ))}
          </>
        ) : null}
      </div>
      {conflict ? (
        <div className="sftp-conflict" data-testid="sftp-conflict" role="dialog">
          <div className="sftp-conflict-card">
            <div className="sftp-conflict-title">{tg('d1.exists', { name: conflict.name })}</div>
            <div className="sftp-conflict-actions">
              <Button variant="primary" onClick={() => conflict.resolve('overwrite', conflict.applyRest)}>
                {tg('d1.overwrite')}
              </Button>
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
              <Button variant="primary" onClick={() => answerClose('close')}>
                {tg('d1.keepBackground')}
              </Button>
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
      <SftpTreeSearch
        open={treeOpen}
        root={remoteCwd}
        onClose={() => setTreeOpen(false)}
        list={(dir) => (sessionId ? window.aiss.sftp.list(sessionId, dir) : Promise.reject(new Error(tg('sftp.noSession'))))}
        onPick={(path, isDir) => {
          // locate only: open the folder (or the file's folder) and select the file
          void refreshRemote(isDir ? path : parentPosix(path)).then(() => {
            if (!isDir) setRemoteSel({ [path]: true })
          })
        }}
      />
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
