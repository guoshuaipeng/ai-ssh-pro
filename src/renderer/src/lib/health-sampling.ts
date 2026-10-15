import { useEffect, useRef, useState } from 'react'
import {
  PROBE_IDLE_HIDDEN_MS,
  PROBE_IDLE_VISIBLE_MS,
  PROBE_INTERVAL_MS,
  allowProbeToast,
  nextBackoffMs,
  planProbeWave,
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
}

type Opts = {
  enabled: boolean
  hosts: SampleHost[]
  maxConcurrent: number
  active: boolean
  nonce: number
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
} {
  const optsRef = useRef(opts)
  optsRef.current = opts
  const [snaps, setSnaps] = useState<Record<string, CardSnap>>({})
  const [lastOkAt, setLastOkAt] = useState<number | null>(null)
  const [kick, setKick] = useState(0)
  const retryRef = useRef<string | null>(null)
  const nextAt = useRef(new Map<string, number>())
  const failures = useRef(new Map<string, number>())
  const toastAt = useRef(new Map<string, number>())
  const running = useRef(new Set<string>())

  useEffect(() => {
    if (!opts.enabled) {
      optsRef.current.onRelease()
      setSnaps({})
      return
    }
    let stop = false
    let timer = 0
    for (const id of [...nextAt.current.keys()]) {
      if (!running.current.has(id)) nextAt.current.delete(id)
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
              nextAt.current.set(id, Date.now() + PROBE_INTERVAL_MS)
              setLastOkAt(res.at)
              setSnaps((prev) => ({
                ...prev,
                [id]: { phase: 'ok', cpu: res.cpu, mem: res.mem, disk: res.disk, at: res.at, error: null, via: res.via, code: undefined }
              }))
              return
            }
            const n = (failures.current.get(id) ?? 0) + 1
            failures.current.set(id, n)
            nextAt.current.set(id, Date.now() + nextBackoffMs(n))
            const code = res.code
            const error = code === 'key' ? tg('l7b.keyUntrusted') : res.error || tg('l7b.fail')
            setSnaps((prev) => ({
              ...prev,
              [id]: { phase: 'fail', cpu: prev[id]?.cpu ?? null, mem: prev[id]?.mem ?? null, disk: prev[id]?.disk ?? null, at: prev[id]?.at ?? null, error, code, via: res.via }
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
            nextAt.current.set(id, Date.now() + nextBackoffMs(n))
            setSnaps((prev) => ({
              ...prev,
              [id]: { phase: 'fail', cpu: prev[id]?.cpu ?? null, mem: prev[id]?.mem ?? null, disk: prev[id]?.disk ?? null, at: prev[id]?.at ?? null, error: tg('l7b.fail'), code: 'other' }
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
  }, [opts.enabled, opts.active, opts.nonce, opts.maxConcurrent, opts.hosts, kick])

  useEffect(() => () => optsRef.current.onRelease(), [])

  return {
    snaps,
    lastOkAt,
    retry: (profileId: string) => {
      retryRef.current = profileId
      setKick((n) => n + 1)
    }
  }
}
