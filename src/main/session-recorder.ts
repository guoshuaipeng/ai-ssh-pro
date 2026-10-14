import { createWriteStream, type WriteStream } from 'node:fs'
import { encodeEventLine, encodeHeaderLine } from '../shared/asciicast'

type RecordingEntry = {
  sessionId: string
  filePath: string
  stream: WriteStream
  startedAt: number
}

/** Session-scoped asciicast v2 recorders. ssh:data appends output events. */
const recordings = new Map<string, RecordingEntry>()

export function startRecording(
  sessionId: string,
  filePath: string,
  meta?: { cols?: number; rows?: number; title?: string }
): void {
  const id = sessionId.trim()
  if (!id || !filePath.trim()) {
    throw new Error('startRecording requires sessionId and filePath')
  }
  stopRecording(id)
  const stream = createWriteStream(filePath, { flags: 'w', encoding: 'utf8' })
  const startedAt = Date.now()
  stream.write(
    encodeHeaderLine({
      version: 2,
      width: meta?.cols && meta.cols > 0 ? meta.cols : 120,
      height: meta?.rows && meta.rows > 0 ? meta.rows : 32,
      timestamp: Math.floor(startedAt / 1000),
      title: meta?.title
    })
  )
  recordings.set(id, { sessionId: id, filePath, stream, startedAt })
}

export function appendRecording(sessionId: string, chunk: string): boolean {
  const entry = recordings.get(sessionId.trim())
  if (!entry || entry.stream.destroyed) return false
  if (!chunk) return true
  const time = (Date.now() - entry.startedAt) / 1000
  entry.stream.write(encodeEventLine(time, 'o', chunk))
  return true
}

/** Alias for callers that prefer appendChunk naming. */
export function appendChunk(sessionId: string, chunk: string): boolean {
  return appendRecording(sessionId, chunk)
}

export function stopRecording(sessionId: string): boolean {
  const id = sessionId.trim()
  const entry = recordings.get(id)
  if (!entry) return false
  recordings.delete(id)
  try {
    entry.stream.end()
  } catch {
    /* ignore close errors */
  }
  return true
}

export function isRecording(sessionId: string): boolean {
  return recordings.has(sessionId.trim())
}

export function getRecordingPath(sessionId: string): string | null {
  return recordings.get(sessionId.trim())?.filePath ?? null
}

export function stopAllRecordings(): void {
  for (const id of [...recordings.keys()]) {
    stopRecording(id)
  }
}

/** Small registry surface for Phase2 / ssh wrappers. */
export const RecordingRegistry = {
  start: startRecording,
  append: appendRecording,
  appendChunk,
  stop: stopRecording,
  isRecording,
  getPath: getRecordingPath,
  stopAll: stopAllRecordings
}
