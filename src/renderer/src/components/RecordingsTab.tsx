import { useEffect, useMemo, useState } from 'react'
import { decodeCast, playbackSchedule, type CastEvent } from '@shared/asciicast'
import { askConfirm } from '../lib/dialogs'
import { tg } from '../lib/i18n'

type Row = { file: string; host: string; bytes: number; mtime: number }

export function RecordingsList({ onOpen, onClose }: { onOpen: (file: string) => void; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const reload = () => {
    void window.aiss.recordings.list().then(setRows)
  }
  useEffect(reload, [])
  return (
    <div className="workspace-panel" data-testid="recordings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('m2.recordings')}</h2>
        <button type="button" onClick={onClose}>{tg('common.close')}</button>
      </div>
      <div className="workspace-panel-body">
        {rows.length === 0 ? <p>{tg('m2.noRecordings')}</p> : null}
        {rows.map((row) => (
          <div key={row.file} className="m2-row">
            <div>
              <strong>{row.host}</strong>
              <div className="l7-meta">{new Date(row.mtime).toLocaleString()} · {row.bytes}</div>
            </div>
            <div className="workspace-panel-actions">
              <button type="button" onClick={() => onOpen(row.file)}>{tg('m2.play')}</button>
              <button
                type="button"
                onClick={() => {
                  void askConfirm(tg('m2.deleteRecording'), tg('m2.deleteRecordingBody', { host: row.host }), {
                    danger: true,
                    okLabel: tg('app.delete')
                  }).then((ok) => {
                    if (!ok) return
                    void window.aiss.recordings.delete(row.file).then(reload)
                  })
                }}
              >
                {tg('app.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RecordingPlayer({ file, onClose }: { file: string; onClose: () => void }) {
  const [events, setEvents] = useState<CastEvent[]>([])
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [skipIdle, setSkipIdle] = useState(true)
  const [pos, setPos] = useState(0)
  useEffect(() => {
    let stop = false
    setPlaying(false)
    setPos(0)
    void window.aiss.recordings.read(file).then((raw) => {
      if (stop) return
      const decoded = decodeCast(raw)
      if (!decoded.ok) {
        setError(decoded.error)
        setEvents([])
        return
      }
      setError('')
      setEvents(decoded.events)
    })
    return () => {
      stop = true
    }
  }, [file])
  const schedule = useMemo(() => playbackSchedule(events, speed, skipIdle), [events, speed, skipIdle])
  const duration = schedule.length ? schedule[schedule.length - 1]!.at : 0
  const text = useMemo(() => {
    let acc = ''
    for (const ev of schedule) {
      if (ev.at > pos + 0.001) break
      if (ev.type === 'o') acc += ev.data
    }
    return acc
  }, [pos, schedule])
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setPos((p) => {
        const next = p + dt
        if (duration <= 0 || next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, playing])
  return (
    <div className="workspace-panel" data-testid="recording-play">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('m2.play')}</h2>
        <button type="button" onClick={onClose}>{tg('common.close')}</button>
      </div>
      <div className="cast-bar" data-testid="cast-bar">
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (playing) {
              setPlaying(false)
              return
            }
            setPos((p) => (duration > 0 && p >= duration ? 0 : p))
            setPlaying(true)
          }}
        >
          {playing ? '❚❚' : tg('m2.play')}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(pos, duration || 0)}
          aria-label={tg('m2.seek')}
          disabled={!schedule.length}
          onChange={(e) => {
            setPlaying(false)
            setPos(Number(e.target.value))
          }}
        />
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={tg('m2.speed')}>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
        <label>
          <input type="checkbox" checked={skipIdle} onChange={(e) => setSkipIdle(e.target.checked)} />
          {tg('m2.skipIdle')}
        </label>
      </div>
      <pre className="m2-cast">{error || text}</pre>
    </div>
  )
}
