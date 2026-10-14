import { useEffect, useState } from 'react'
import { castToText, decodeCast, playbackSchedule } from '@shared/asciicast'
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
              <button type="button" onClick={() => void window.aiss.recordings.delete(row.file).then(reload)}>{tg('app.delete')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RecordingPlayer({ file, onClose }: { file: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  useEffect(() => {
    let stop = false
    void window.aiss.recordings.read(file).then((raw) => {
      const decoded = decodeCast(raw)
      if (!decoded.ok || stop) {
        setText(decoded.ok ? '' : decoded.error)
        return
      }
      setText(castToText(decoded.events))
    })
    return () => {
      stop = true
    }
  }, [file])
  const play = async () => {
    const raw = await window.aiss.recordings.read(file)
    const decoded = decodeCast(raw)
    if (!decoded.ok) return
    setPlaying(true)
    setText('')
    const schedule = playbackSchedule(decoded.events, speed, true)
    let acc = ''
    for (const ev of schedule) {
      await new Promise((r) => window.setTimeout(r, Math.max(0, ev.at * 1000 - acc.length)))
      if (ev.type === 'o') {
        acc += ev.data
        setText(acc)
      }
    }
    setPlaying(false)
  }
  return (
    <div className="workspace-panel" data-testid="recording-play">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('m2.play')}</h2>
        <div className="workspace-panel-actions">
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={tg('m2.speed')}>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
          <button type="button" className="primary" disabled={playing} onClick={() => void play()}>{tg('m2.play')}</button>
          <button type="button" onClick={onClose}>{tg('common.close')}</button>
        </div>
      </div>
      <pre className="m2-cast">{text}</pre>
    </div>
  )
}
