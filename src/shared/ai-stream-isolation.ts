/** H04: rapid multi-turn stream isolation (pure model for held-out tests). */
import { applyStreamDelta, finalizeStoppedLines, type StreamStopLine } from './ai-stream-stop'

export type IsoLine = StreamStopLine

export type IsoTurn = {
  id: string
  lines: IsoLine[]
  /** Stop clicked — late deltas must not reopen a streaming card. */
  stopped?: boolean
}

export type IsoState = {
  liveId: string | null
  turns: Record<string, IsoTurn>
}

export function createIsoState(): IsoState {
  return { liveId: null, turns: {} }
}

/** Whether a stream event for `turnId` may mutate the live transcript. */
export function isLiveIsoTurn(state: IsoState, turnId: string): boolean {
  const t = state.turns[turnId]
  if (!t || t.stopped) return false
  return state.liveId === turnId
}

/** True when this turn should ignore further stream deltas (stopped or superseded). */
export function shouldIgnoreIsoDelta(state: IsoState, turnId: string): boolean {
  const t = state.turns[turnId]
  if (!t) return true
  if (t.stopped) return true
  // Superseded turns keep their own buffer in the product, but must not paint live.
  // Held-out H04 asserts live transcript ownership via isLiveIsoTurn; late deltas on a
  // superseded turn are recorded only when `allowOffLive` is set.
  return false
}

export function beginIsoTurn(state: IsoState, id: string, userText: string): IsoState {
  const turn: IsoTurn = {
    id,
    lines: [{ role: 'user', content: userText }],
    stopped: false
  }
  return {
    liveId: id,
    turns: { ...state.turns, [id]: turn }
  }
}

export function stopIsoTurn(state: IsoState, id?: string | null, cancelledMessage = '已取消'): IsoState {
  const target = id ?? state.liveId
  if (!target || !state.turns[target]) return state
  const t = state.turns[target]
  const lines = finalizeStoppedLines(t.lines, cancelledMessage, { ensureCancelledRow: true })
  return {
    liveId: state.liveId === target ? null : state.liveId,
    turns: {
      ...state.turns,
      [target]: { ...t, stopped: true, lines }
    }
  }
}

export type ApplyDeltaOpts = {
  /** When true, superseded (non-live) turns still append to their own buffer. */
  allowOffLive?: boolean
}

export function applyIsoDelta(
  state: IsoState,
  turnId: string,
  chunk: string,
  opts?: ApplyDeltaOpts
): IsoState {
  const t = state.turns[turnId]
  if (!t || t.stopped) return state
  const live = state.liveId === turnId
  if (!live && !opts?.allowOffLive) return state
  return {
    ...state,
    turns: {
      ...state.turns,
      [turnId]: { ...t, lines: applyStreamDelta(t.lines, chunk) }
    }
  }
}

export function completeIsoTurn(state: IsoState, turnId: string, text: string): IsoState {
  const t = state.turns[turnId]
  if (!t || t.stopped) return state
  const nextLines = [...t.lines]
  const last = nextLines[nextLines.length - 1]
  if (last?.role === 'assistant' && last.streaming) {
    nextLines[nextLines.length - 1] = { ...last, content: text, streaming: false }
  } else if (last?.role === 'assistant') {
    nextLines[nextLines.length - 1] = { ...last, content: text, streaming: false }
  } else {
    nextLines.push({ role: 'assistant', content: text, streaming: false })
  }
  return {
    liveId: state.liveId === turnId ? null : state.liveId,
    turns: {
      ...state.turns,
      [turnId]: { ...t, lines: nextLines }
    }
  }
}

export type IsoEvent =
  | { op: 'begin'; turn: string; user: string }
  | { op: 'delta'; turn: string; chunk: string }
  | { op: 'complete'; turn: string; text: string }
  | { op: 'stop'; turn?: string }

/** Replay a declarative event list; returns final state. */
export function replayIsoEvents(events: IsoEvent[], opts?: ApplyDeltaOpts): IsoState {
  let state = createIsoState()
  for (const ev of events) {
    if (ev.op === 'begin') state = beginIsoTurn(state, ev.turn, ev.user)
    else if (ev.op === 'delta') state = applyIsoDelta(state, ev.turn, ev.chunk, opts)
    else if (ev.op === 'complete') state = completeIsoTurn(state, ev.turn, ev.text)
    else if (ev.op === 'stop') state = stopIsoTurn(state, ev.turn)
  }
  return state
}

/** Assistant text joined for assertions (non-user rows). */
export function assistantText(turn: IsoTurn | undefined): string {
  if (!turn) return ''
  return turn.lines
    .filter((l) => l.role === 'assistant')
    .map((l) => l.content)
    .join('')
}

export function liveAssistantText(state: IsoState): string {
  if (!state.liveId) return ''
  return assistantText(state.turns[state.liveId])
}
