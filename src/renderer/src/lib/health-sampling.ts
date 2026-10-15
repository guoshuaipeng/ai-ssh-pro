import { useEffect, useRef, useState } from 'react'
import {
  PROBE_IDLE_HIDDEN_MS,
  PROBE_IDLE_VISIBLE_MS,
  PROBE_INTERVAL_MS,
  allowProbeToast,
  nextBackoffMs,
  planProbeWave,
  retryAllAllowed,
  type HealthProbeResult
} from '@shared/health-probe'
import { tg } from './i18n'
import { showToast } from './toast'

export type SampleHost = {
  profileId: string
  title: string
  demo?: boolean
  sessionId?: string
}

export type CardPhase = 'off' | 'queued' | 'probing' | 'ok' | 'fail'

export type CardSnap = {
  phase: CardPhase
  cpu: number | null
  mem: number | null
  disk: number | null
  at: number | null
  error: string | null
  code?: HealthProbeResult['code']
  via?: HealthProbeResult['via']
  retryAt?: number | null
  load?: HealthProbeResult['load']
  inode?: HealthProbeResult['inode']
  mounts?: HealthProbeResult['mounts']
}

type Opts = {
  enabled: boolean
  hosts: SampleHost[]
  maxConcurrent: number
  active: boolean
  nonce: number
  backoffCapMin?: number
  retryAllNonce?: number
  onSample: (host: SampleHost) => Promise<HealthProbeResult>
  onSweep: (idleMs: number) => void
  onRelease: () => void
}

const emptySnap = (phase: CardPhase): CardSnap => ({
  phase,
  cpu: null,
  mem: null,
  disk: null,
  at: null,
  error: null
})

/** Drives the home probe queue. In-flight samples are left alone; hidden pages only sweep. */
export function useHealthSampling(opts: Opts): {
  snaps: Record<string, CardSnap>
  lastOkAt: number | null
  retry: (profileId: string) => void
  retryAll: () => boolean
  coolUntil: number
} {
  const optsRef = useRef(opts)
  optsRef.current = opts
  const [snaps, setSnaps] = useState<Record<string, CardSnap>>({})
  const [lastOkAt, setLastOkAt] = useState<number | null>(null)
  const [kick, setKick] = useState(0)
  const [coolUntil, setCoolUntil] = useState(0)
  const retryRef = useRef<string | null>(null)
  const retryAllRef = useRef(false)
  const nextAt = useRef(new Map<string, number>())
  const failures = useRef(new Map<string, number>())
  const failed = useRef(new Set<string>())
  const toastAt = useRef(new Map<string, number>())
  const running = useRef(new Set<string>())
  const nonceSeen = useRef<number | null>(null)
  const allNonceSeen = useRef<number | null>(null)
  const lastAll = useRef<number | null>(null)
  const capRef = useRef(5)
  capRef.current = opts.backoffCapMin ?? 5

  useEffect(() => {
    if (!opts.enabled) {
      optsRef.current.onRelease()
      setSnaps({})
      return
    }
    let stop = false
    let timer = 0
    const nonce = optsRef.current.nonce
    if (nonceSeen.current == null) nonceSeen.current = nonce
    else if (nonceSeen.current !== nonce) {
      nonceSeen.current = nonce
      for (const id of [...nextAt.current.keys()]) {
        if (!running.current.has(id)) nextAt.current.delete(id)
      }
    }
    const allNonce = optsRef.current.retryAllNonce ?? 0
    const clearFailed = (now: number) => {
      if (!retryAllAllowed(lastAll.current, now)) return false
      lastAll.current = now
      setCoolUntil(now + 10_000)
      for (const id of failed.current) {
        nextAt.current.delete(id)
        failures.current.delete(id)
      }
      return true
    }
    if (allNonceSeen.current == null) allNonceSeen.current = allNonce
    else if (allNonceSeen.current !== allNonce) {
      allNonceSeen.current = allNonce
      clearFailed(Date.now())
    }
    if (retryAllRef.current) {
      retryAllRef.current = false
      clearFailed(Date.now())
    }
    const tick = () => {
      if (stop) return
      const cur = optsRef.current
      const visible = cur.active && (typeof document === 'undefined' || !document.hidden)
      if (!visible) {
        cur.onSweep(PROBE_IDLE_HIDDEN_MS)
        timer = window.setTimeout(tick, 5_000)
        return
      }
      const now = Date.now()
      const retry = retryRef.current
      if (retry) {
        retryRef.current = null
        nextAt.current.delete(retry)
        failures.current.delete(retry)
      }
      const shown = cur.hosts
      const due = shown
        .map((h) => h.profileId)
        .filter((id) => !running.current.has(id) && (nextAt.current.get(id) ?? 0) <= now)
      const wave = planProbeWave(due, running.current.size, cur.maxConcurrent)
      if (wave.start.length || wave.queued.length) {
        setSnaps((prev) => {
          const next = { ...prev }
          for (const id of wave.queued) next[id] = { ...(next[id] ?? emptySnap('queued')), phase: 'queued' }
          for (const id of wave.start) next[id] = { ...(next[id] ?? emptySnap('probing')), phase: 'probing', error: null }
          return next
        })
      }
      for (const id of wave.start) {
        const host = shown.find((h) => h.profileId === id)
        if (!host) continue
        running.current.add(id)
        void cur
          .onSample(host)
          .then((res) => {
            if (stop) return
            if (res.ok && (res.cpu != null || res.mem != null || res.disk != null)) {
              failures.current.delete(id)
              failed.current.delete(id)
              nextAt.current.set(id, Date.now() + PROBE_INTERVAL_MS)
              setLastOkAt(res.at)
              setSnaps((prev) => ({
                ...prev,
                [id]: {
                  phase: 'ok',
                  cpu: res.cpu,
                  mem: res.mem,
                  disk: res.disk,
                  at: res.at,
                  error: null,
                  via: res.via,
                  code: undefined,
                  retryAt: null,
                  load: res.load,
                  inode: res.inode,
                  mounts: res.mounts
                }
              }))
              return
            }
            const n = (failures.current.get(id) ?? 0) + 1
            failures.current.set(id, n)
            failed.current.add(id)
            const retryAt = Date.now() + nextBackoffMs(n, capRef.current)
            nextAt.current.set(id, retryAt)
            const code = res.code
            const error = code === 'key' ? tg('l7b.keyUntrusted') : res.error || tg('l7b.fail')
            setSnaps((prev) => ({
              ...prev,
              [id]: { phase: 'fail', cpu: prev[id]?.cpu ?? null, mem: prev[id]?.mem ?? null, disk: prev[id]?.disk ?? null, at: prev[id]?.at ?? null, error, code, via: res.via, retryAt }
            }))
            const stamp = toastAt.current.get(id)
            const tnow = Date.now()
            if (allowProbeToast(stamp, tnow)) {
              toastAt.current.set(id, tnow)
              showToast(tg('l7b.toastFail', { host: host.title, reason: error }), { kind: 'error' })
            }
          })
          .catch(() => {
            if (stop) return
            const n = (failures.current.get(id) ?? 0) + 1
            failures.current.set(id, n)
            failed.current.add(id)
            const retryAt = Date.now() + nextBackoffMs(n, capRef.current)
            nextAt.current.set(id, retryAt)
            setSnaps((prev) => ({
              ...prev,
              [id]: { phase: 'fail', cpu: prev[id]?.cpu ?? null, mem: prev[id]?.mem ?? null, disk: prev[id]?.disk ?? null, at: prev[id]?.at ?? null, error: tg('l7b.fail'), code: 'other', retryAt }
            }))
          })
          .finally(() => {
            running.current.delete(id)
          })
      }
      const soonest = Math.min(...shown.map((h) => nextAt.current.get(h.profileId) ?? now + PROBE_INTERVAL_MS))
      const wait = wave.start.length ? 800 : Math.max(800, Math.min(PROBE_INTERVAL_MS, soonest - Date.now()))
      timer = window.setTimeout(tick, wait)
      if (visible) cur.onSweep(PROBE_IDLE_VISIBLE_MS)
    }
    tick()
    const onVis = () => {
      window.clearTimeout(timer)
      tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [opts.enabled, opts.active, opts.nonce, opts.maxConcurrent, opts.hosts, opts.retryAllNonce, kick])

  useEffect(() => () => optsRef.current.onRelease(), [])

  return {
    snaps,
    lastOkAt,
    retry: (profileId: string) => {
      retryRef.current = profileId
      failed.current.delete(profileId)
      failures.current.delete(profileId)
      nextAt.current.delete(profileId)
      setKick((n) => n + 1)
    },
    retryAll: () => {
      if (!retryAllAllowed(lastAll.current, Date.now())) return false
      retryAllRef.current = true
      setKick((n) => n + 1)
      return true
    },
    coolUntil
  }
}
