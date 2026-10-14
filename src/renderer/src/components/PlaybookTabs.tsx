import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommandSnippet, SavedSessionProfile } from '@shared/ipc'
import { effectiveLevel } from '@shared/protection'
import {
  AUTOSAVE_MS,
  DEFAULT_PARALLEL,
  blankStep,
  clampParallel,
  ensureSamples,
  exportPlaybook,
  hostSelectable,
  importPlaybook,
  loadPlaybooks,
  loadResults,
  resultToMarkdown,
  runPlaybook,
  savePlaybooks,
  saveResult,
  stepCommand,
  stepNeedsConfirm,
  substituteVars,
  upsertPlaybook,
  type Playbook,
  type PlaybookHost,
  type PlaybookRunResult,
  type PlaybookStep
} from '@shared/playbook'
import { appendAudit } from '@shared/audit-log'
import { tg } from '../lib/i18n'
import { askConfirm, askText } from '../lib/dialogs'

function persist(list: Playbook[]) {
  savePlaybooks(list)
  window.dispatchEvent(new Event('aiss-playbooks'))
}

export function loadLastResult(): PlaybookRunResult | null {
  return loadResults()[0] ?? null
}

function hostsFrom(profiles: SavedSessionProfile[], live: Map<string, string>): PlaybookHost[] {
  return profiles.map((p) => ({
    id: p.id,
    name: p.label || p.host,
    user: p.username,
    host: p.host,
    level: effectiveLevel(p),
    sessionId: live.get(p.id)
  }))
}

export function PlaybookList({
  profiles,
  onEdit,
  onRun,
  onClose
}: {
  profiles: SavedSessionProfile[]
  onEdit: (id: string) => void
  onRun: (id: string) => void
  onClose: () => void
}) {
  const [list, setList] = useState<Playbook[]>(() => ensureSamples(loadPlaybooks()))
  useEffect(() => persist(list), [list])
  const add = () => {
    const pb: Playbook = {
      id: `pb-${Date.now()}`,
      name: tg('m2.newPlaybook'),
      description: '',
      steps: [blankStep()],
      updatedAt: Date.now()
    }
    setList((cur) => upsertPlaybook(cur, pb))
    onEdit(pb.id)
  }
  const doImport = async () => {
    const raw = await askText(tg('m2.importJson'), '')
    if (!raw) return
    const parsed = importPlaybook(raw)
    if (!parsed.ok) return
    setList((cur) => upsertPlaybook(cur, parsed.playbook))
  }
  return (
    <div className="workspace-panel" data-testid="playbook-list">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('m2.playbooks')}</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={() => void doImport()}>{tg('m2.import')}</button>
          <button type="button" className="primary" onClick={add}>{tg('m2.new')}</button>
          <button type="button" onClick={onClose}>{tg('common.close')}</button>
        </div>
      </div>
      <div className="workspace-panel-body">
        {list.map((p) => (
          <div key={p.id} className="m2-row">
            <div>
              <strong>{p.name}</strong>
              <div className="l7-meta">{p.steps.length} · {p.description}</div>
            </div>
            <div className="workspace-panel-actions">
              <button type="button" onClick={() => onEdit(p.id)}>{tg('ctx.edit')}</button>
              <button type="button" className="primary" onClick={() => onRun(p.id)} disabled={!profiles.length}>{tg('m2.run')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PlaybookEditor({
  playbookId,
  snippets: snippetsProp,
  onRun,
  onClose
}: {
  playbookId: string
  snippets?: CommandSnippet[]
  onRun: (id: string) => void
  onClose: () => void
}) {
  const [snippets, setSnippets] = useState<CommandSnippet[]>(snippetsProp ?? [])
  useEffect(() => {
    if (snippetsProp?.length) {
      setSnippets(snippetsProp)
      return
    }
    void window.aiss.snippets.list().then(setSnippets).catch(() => undefined)
  }, [snippetsProp])
  const [pb, setPb] = useState<Playbook | null>(() => loadPlaybooks().find((p) => p.id === playbookId) ?? null)
  const edited = useRef(0)
  useEffect(() => {
    if (!pb) return
    edited.current = Date.now()
    const timer = window.setTimeout(() => {
      if (Date.now() - edited.current >= AUTOSAVE_MS - 20) {
        const next = upsertPlaybook(loadPlaybooks(), { ...pb, updatedAt: Date.now() })
        persist(next)
      }
    }, AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [pb])
  if (!pb) return <div className="workspace-panel"><p>{tg('m2.missing')}</p></div>
  const patchStep = (id: string, patch: Partial<PlaybookStep>) => {
    setPb({ ...pb, steps: pb.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }
  return (
    <div className="workspace-panel" data-testid="playbook-edit">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('m2.edit')}</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={() => void navigator.clipboard.writeText(exportPlaybook(pb))}>{tg('m2.export')}</button>
          <button type="button" className="primary" onClick={() => onRun(pb.id)}>{tg('m2.run')}</button>
          <button type="button" onClick={onClose}>{tg('common.close')}</button>
        </div>
      </div>
      <div className="workspace-panel-body m2-form">
        <input value={pb.name} onChange={(e) => setPb({ ...pb, name: e.target.value })} aria-label={tg('m2.name')} />
        <input value={pb.description} onChange={(e) => setPb({ ...pb, description: e.target.value })} aria-label={tg('m2.desc')} />
        {pb.steps.map((step, i) => (
          <div key={step.id} className="m2-step">
            <div className="jump-hop-title">
              <span>{i + 1}</span>
              <select value={step.type} onChange={(e) => patchStep(step.id, { type: e.target.value as PlaybookStep['type'] })}>
                <option value="command">{tg('m2.stepCommand')}</option>
                <option value="snippet">{tg('m2.stepSnippet')}</option>
                <option value="toolbox">{tg('m2.stepToolbox')}</option>
              </select>
              <button type="button" onClick={() => setPb({ ...pb, steps: pb.steps.filter((s) => s.id !== step.id) })}>{tg('app.delete')}</button>
            </div>
            {step.type === 'toolbox' ? (
              <p className="l4-soon">{tg('m2.toolboxSoon')}</p>
            ) : step.type === 'snippet' ? (
              <select value={step.snippetId ?? ''} onChange={(e) => patchStep(step.id, { snippetId: e.target.value })}>
                <option value="">{tg('m2.pickSnippet')}</option>
                {snippets.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            ) : (
              <textarea value={step.command ?? ''} onChange={(e) => patchStep(step.id, { command: e.target.value })} rows={2} />
            )}
            <label className="l4-check"><input type="checkbox" checked={step.confirm} onChange={(e) => patchStep(step.id, { confirm: e.target.checked })} />{tg('m2.confirmStep')}</label>
            <label className="l4-check"><input type="checkbox" checked={step.stopOnError} onChange={(e) => patchStep(step.id, { stopOnError: e.target.checked })} />{tg('m2.stopOnError')}</label>
            <label className="l4-check">{tg('m2.timeout')}<input type="number" min={1} max={600} value={step.timeoutSec} onChange={(e) => patchStep(step.id, { timeoutSec: Number(e.target.value) || 60 })} /></label>
          </div>
        ))}
        <button type="button" onClick={() => setPb({ ...pb, steps: [...pb.steps, blankStep()] })}>{tg('m2.addStep')}</button>
      </div>
    </div>
  )
}

export function PlaybookRun({
  playbookId,
  profiles,
  live,
  snippets: snippetsProp,
  onResult,
  onClose
}: {
  playbookId: string
  profiles: SavedSessionProfile[]
  live: Map<string, string>
  snippets?: CommandSnippet[]
  onResult: (result: PlaybookRunResult) => void
  onClose: () => void
}) {
  const [snippets, setSnippets] = useState<CommandSnippet[]>(snippetsProp ?? [])
  useEffect(() => {
    if (snippetsProp?.length) {
      setSnippets(snippetsProp)
      return
    }
    void window.aiss.snippets.list().then(setSnippets).catch(() => undefined)
  }, [snippetsProp])
  const playbook = useMemo(() => loadPlaybooks().find((p) => p.id === playbookId) ?? null, [playbookId])
  const hosts = useMemo(() => hostsFrom(profiles, live), [profiles, live])
  const [picked, setPicked] = useState<string[]>(() => hosts.filter(hostSelectable).map((h) => h.id))
  const [mode, setMode] = useState<'parallel' | 'serial'>('parallel')
  const [limit, setLimit] = useState(DEFAULT_PARALLEL)
  const [preview, setPreview] = useState(true)
  const [running, setRunning] = useState(false)
  if (!playbook) return <div className="workspace-panel"><p>{tg('m2.missing')}</p></div>
  const selected = hosts.filter((h) => picked.includes(h.id) && hostSelectable(h))
  const start = async () => {
    setRunning(true)
    const result = await runPlaybook({
      playbook,
      hosts: selected,
      mode,
      parallelLimit: clampParallel(limit),
      snippets,
      confirm: async (req) => {
        if (req.requireHostName) {
          const typed = await askText(tg('l4.typeHost', { host: req.host.name }), '')
          if ((typed ?? '').trim() !== req.host.name && (typed ?? '').trim() !== req.host.host) return 'skip'
        }
        const ok = await askConfirm(tg('m2.confirmTitle'), substituteVars(req.command, req.host), { danger: req.dangerous, okLabel: tg('m2.run') })
        return ok ? 'run' : 'skip'
      },
      exec: async (host, command, timeoutMs) => {
        if (!host.sessionId || !window.aiss?.ssh?.exec) return { code: null, stdout: '', stderr: '', error: 'not-connected' }
        try {
          const out = await window.aiss.ssh.exec(host.sessionId, command, timeoutMs)
          return { code: out.code, stdout: out.stdout, stderr: out.stderr }
        } catch (e) {
          return { code: null, stdout: '', stderr: '', error: e instanceof Error ? e.message : String(e) }
        }
      }
    })
    saveResult(result)
    appendAudit({
      type: 'playbook.run',
      host: selected.map((h) => h.name).join(', ') || playbook.name,
      source: 'playbook',
      outcome: result.aborted ? 'cancelled' : 'allowed',
      detail: `${playbook.name} ${result.cells.filter((c) => c.state === 'ok').length}/${result.cells.length}`
    })
    const saved = loadPlaybooks().map((p) => (p.id === playbook.id ? { ...p, lastRunAt: Date.now() } : p))
    persist(saved)
    setRunning(false)
    onResult(result)
  }
  return (
    <div className="workspace-panel" data-testid="playbook-run">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{playbook.name}</h2>
        <div className="workspace-panel-actions">
          <button type="button" className="primary" disabled={running || !selected.length} onClick={() => void start()}>{tg('m2.execute')}</button>
          <button type="button" onClick={onClose}>{tg('common.close')}</button>
        </div>
      </div>
      <div className="workspace-panel-body m2-form">
        <div className="l2-filters">
          <label className="l4-check"><input type="radio" checked={mode === 'parallel'} onChange={() => setMode('parallel')} />{tg('m2.parallel')}</label>
          <label className="l4-check"><input type="radio" checked={mode === 'serial'} onChange={() => setMode('serial')} />{tg('m2.serial')}</label>
          <label className="l4-check">{tg('m2.limit')}<input type="number" min={1} max={32} value={limit} onChange={(e) => setLimit(clampParallel(Number(e.target.value)))} /></label>
          <label className="l4-check"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />{tg('m2.preview')}</label>
        </div>
        {hosts.map((h) => (
          <label key={h.id} className="l4-check">
            <input
              type="checkbox"
              disabled={!hostSelectable(h)}
              checked={hostSelectable(h) && picked.includes(h.id)}
              onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, h.id] : cur.filter((id) => id !== h.id)))}
            />
            {h.name}
            {!hostSelectable(h) ? <span className="l4-soon">{tg('l4.readonly')}</span> : null}
            {!h.sessionId && hostSelectable(h) ? <span className="l7-meta">{tg('m2.offline')}</span> : null}
          </label>
        ))}
        {preview
          ? selected.flatMap((h) =>
              playbook.steps.map((s) => {
                const cmd = substituteVars(stepCommand(s, snippets), h)
                const gate = stepNeedsConfirm(s, cmd, h.level)
                return (
                  <div key={`${h.id}-${s.id}`} className="m2-preview-line">
                    <code>{h.name}</code> {cmd || tg('m2.toolboxSoon')}
                    {gate.confirm ? <span className="l4-soon">{tg('m2.needsConfirm')}</span> : null}
                  </div>
                )
              })
            )
          : null}
      </div>
    </div>
  )
}

export function PlaybookResult({ onClose }: { onClose: () => void }) {
  const result = loadLastResult()
  if (!result) return <div className="workspace-panel" data-testid="playbook-result"><p>{tg('m2.noResult')}</p></div>
  const steps = [...new Map(result.cells.map((c) => [c.stepId, c.stepId])).keys()].map((id) => ({
    id,
    type: 'command' as const,
    confirm: false,
    stopOnError: true,
    timeoutSec: 60
  }))
  const hosts = [...new Set(result.cells.map((c) => c.hostId))].map((id) => ({ id, name: id }))
  const md = resultToMarkdown(result, hosts, steps)
  return (
    <div className="workspace-panel" data-testid="playbook-result">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{result.name}</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={() => void window.aiss.files.saveText(`${result.name}.md`, md)}>{tg('m2.export')}</button>
          <button type="button" onClick={onClose}>{tg('common.close')}</button>
        </div>
      </div>
      <div className="workspace-panel-body">
        <table className="audit-table">
          <tbody>
            {result.cells.map((c) => (
              <tr key={`${c.hostId}-${c.stepId}`}>
                <td>{c.hostId}</td>
                <td>{c.state}</td>
                <td>{c.code ?? ''}</td>
                <td>{c.error || c.stdout || c.stderr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
