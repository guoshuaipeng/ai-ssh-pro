import { useEffect, useMemo, useState } from 'react'
import { decodeCast, playbackSchedule, type CastEvent } from '@shared/asciicast'
import { CLIP_GIF_MAX_SEC, clampGifMax, clipFrames, clipGifAllowed, clipMarkdown, clipSpanSec } from '@shared/cast-clip'
import { gifFromTextFrames } from '@shared/cast-gif'
import { askConfirm } from '../lib/dialogs'
import { tg } from '../lib/i18n'
import { showToast } from '../lib/toast'

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(bin)
}

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
  const [clipStart, setClipStart] = useState(0)
  const [clipEnd, setClipEnd] = useState(0)
  const [gifMax, setGifMax] = useState(CLIP_GIF_MAX_SEC)
  const [includeText, setIncludeText] = useState(true)
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
      const end = decoded.events.length ? decoded.events[decoded.events.length - 1]!.time : 0
      setClipStart(0)
      setClipEnd(Math.min(end, CLIP_GIF_MAX_SEC))
    })
    return () => {
      stop = true
    }
  }, [file])
  const schedule = useMemo(() => playbackSchedule(events, speed, skipIdle), [events, speed, skipIdle])
  const duration = schedule.length ? schedule[schedule.length - 1]!.at : 0
  const castEnd = events.length ? events[events.length - 1]!.time : 0
  const hasRecording = events.length > 0 && !error
  const span = clipSpanSec(clipStart, clipEnd)
  const gifOk = hasRecording && clipGifAllowed(clipStart, clipEnd, gifMax)
  const exportClip = (kind: 'gif' | 'md') => {
    if (!hasRecording || span <= 0) return
    const title = file.split(/[\\/]/).pop() || 'recording'
    if (kind === 'md') {
      const md = clipMarkdown({ title, start: clipStart, end: clipEnd, events, includeText })
      void window.aiss.files.saveText(`${title}.md`, md)
      return
    }
    if (!gifOk) {
      showToast(tg('l4c.gifTooLong', { n: gifMax }))
      return
    }
    const frames = clipFrames(events, clipStart, clipEnd)
    const gif = gifFromTextFrames(frames)
    void window.aiss.files.saveBytes(`${title}.gif`, bytesToBase64(gif))
  }
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
      <div className="cast-clip" data-testid="l4c-clip">
        <label>
          {tg('l4c.start')}
          <input
            type="number"
            min={0}
            max={castEnd || 0}
            step={0.1}
            value={clipStart}
            data-testid="l4c-start"
            aria-label={tg('l4c.start')}
            disabled={!hasRecording}
            onChange={(e) => setClipStart(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label>
          {tg('l4c.end')}
          <input
            type="number"
            min={0}
            max={castEnd || 0}
            step={0.1}
            value={clipEnd}
            data-testid="l4c-end"
            aria-label={tg('l4c.end')}
            disabled={!hasRecording}
            onChange={(e) => setClipEnd(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label>
          {tg('l4c.gifMax')}
          <input
            type="number"
            min={5}
            max={120}
            value={gifMax}
            data-testid="l4c-max"
            aria-label={tg('l4c.gifMax')}
            onChange={(e) => setGifMax(clampGifMax(Number(e.target.value)))}
          />
        </label>
        <label>
          <input type="checkbox" checked={includeText} data-testid="l4c-text" onChange={(e) => setIncludeText(e.target.checked)} />
          {tg('l4c.includeText')}
        </label>
        <button
          type="button"
          data-testid="l4c-gif"
          disabled={!gifOk}
          title={hasRecording ? (gifOk ? tg('l4c.gif') : tg('l4c.gifTooLong', { n: gifMax })) : tg('l4c.noRecording')}
          onClick={() => exportClip('gif')}
        >
          {tg('l4c.gif')}
        </button>
        <button
          type="button"
          data-testid="l4c-md"
          disabled={!hasRecording || span <= 0}
          title={hasRecording ? tg('l4c.md') : tg('l4c.noRecording')}
          onClick={() => exportClip('md')}
        >
          {tg('l4c.md')}
        </button>
      </div>
      <pre className="m2-cast">{error || text}</pre>
    </div>
  )
}
