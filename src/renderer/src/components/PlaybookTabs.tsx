import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommandSnippet, SavedSessionProfile } from '@shared/ipc'
import { effectiveLevel } from '@shared/protection'
import { playbookRunDisabled, stricterLevel } from '@shared/readonly-session'
import { builtinPlaybooks, type LibrarySeg } from '@shared/builtin-pack'
import {
  AUTOSAVE_MS,
  DEFAULT_PARALLEL,
  blankStep,
  clampParallel,
  exportPlaybook,
  hostSelectable,
  importPlaybook,
  isBuiltinPlaybookId,
  loadPlaybooks,
  loadResults,
  partitionStoredPlaybooks,
  resolvePlaybook,
  resultToMarkdown,
  runPlaybook,
  saveAsPlaybook,
  savePlaybooks,
  saveResult,
  upsertPlaybook,
  type Playbook,
  type PlaybookHost,
  type PlaybookRunResult,
  type PlaybookStep,
  type PlaybookVar
} from '@shared/playbook'
import { discoverVars, initialHostIds, isStaleDraft, promoteDraft, sortPlaybooks } from '@shared/playbook-draft'
import { auditVarDetail, dryRunPlaybook, type DryRunResult } from '@shared/playbook-dry'
import {
  REMINDER_CADENCES,
  dueReminders,
  loadReminders,
  noteDryRun,
  reminderFor,
  saveReminders,
  setCadence,
  snoozeReminder,
  type ReminderCadence
} from '@shared/playbook-reminder'
import { appendAudit, appendGate } from '@shared/audit-log'
import { ShareExportModal } from './PlaybookShare'
import { appendTimeline } from '@shared/timeline'
import { tg } from '../lib/i18n'
import { askConfirm, askText, toastUndo } from '../lib/dialogs'
import { showToast } from '../lib/toast'
import Icon from './Icon'
import EmptyState from './EmptyState'
import PanelHeader from './ui/PanelHeader'
import Button from './ui/Button'
import Select from './ui/Select'
import { moveStep } from '@shared/playbook-steps'

function persist(list: Playbook[]) {
  savePlaybooks(list)
  window.dispatchEvent(new Event('aiss-playbooks'))
}

export function loadLastResult(): PlaybookRunResult | null {
  return loadResults()[0] ?? null
}

function hostsFrom(profiles: SavedSessionProfile[], live: Map<string, string>, sessionReadonly?: Readonly<Record<string, boolean>>): PlaybookHost[] {
  return profiles.map((p) => ({
    id: p.id,
    name: p.label || p.host,
    user: p.username,
    host: p.host,
    level: stricterLevel(effectiveLevel(p), Boolean(sessionReadonly?.[p.id])),
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
  const [list, setList] = useState<Playbook[]>(() => sortPlaybooks(partitionStoredPlaybooks(loadPlaybooks()).user))
  const [more, setMore] = useState(false)
  const [seg, setSeg] = useState<LibrarySeg>('all')
  const builtins = useMemo(() => builtinPlaybooks(), [])
  const [picked, setPicked] = useState<string[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [exportIds, setExportIds] = useState<string[] | null>(null)
  const [dueOnly, setDueOnly] = useState(false)
  const [reminders, setReminders] = useState(() => loadReminders())
  useEffect(() => {
    const onDue = () => setDueOnly(true)
    const onChange = () => setReminders(loadReminders())
    const onBuiltin = () => setSeg('builtin')
    window.addEventListener('aiss-playbook-filter-due', onDue)
    window.addEventListener('aiss-reminder-change', onChange)
    window.addEventListener('aiss-builtin-playbooks', onBuiltin)
    return () => {
      window.removeEventListener('aiss-playbook-filter-due', onDue)
      window.removeEventListener('aiss-reminder-change', onChange)
      window.removeEventListener('aiss-builtin-playbooks', onBuiltin)
    }
  }, [])
  const dueIds = new Set(dueReminders(reminders).map((r) => r.playbookId))
  const shown = dueOnly ? list.filter((p) => dueIds.has(p.id)) : list
  const showBuiltin = !dueOnly && seg !== 'mine'
  const showUser = seg !== 'builtin'
  const saveBuiltinAs = (playbook: Playbook) => {
    const copy = saveAsPlaybook(playbook)
    setList((cur) => sortPlaybooks(upsertPlaybook(cur, copy)))
    showToast(tg('w9.savedAs', { name: copy.name }))
  }
  useEffect(() => persist(list), [list])
  useEffect(() => {
    const refresh = () => {
      const next = sortPlaybooks(partitionStoredPlaybooks(loadPlaybooks()).user)
      setList((cur) => {
        const same = cur.length === next.length && cur.every((row, index) => {
          const other = next[index]
          return other && row.id === other.id && row.name === other.name && row.updatedAt === other.updatedAt && row.steps.length === other.steps.length
        })
        return same ? cur : next
      })
    }
    window.addEventListener('aiss-playbooks', refresh)
    return () => window.removeEventListener('aiss-playbooks', refresh)
  }, [])
  useEffect(() => {
    const open = () => {
      setExportIds(null)
      setExportOpen(true)
    }
    window.addEventListener('aiss-export-share', open)
    return () => window.removeEventListener('aiss-export-share', open)
  }, [])
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
      <PanelHeader
        title={tg('m2.playbooks')}
        actions={
          <>
            <button type="button" onClick={() => void doImport()}>{tg('m2.import')}</button>
            <button type="button" data-testid="w6-filter" className={dueOnly ? 'is-on' : ''} onClick={() => setDueOnly((v) => !v)}>{tg('w6.filter')}</button>
            <Button variant="primary" onClick={add}>{tg('m2.new')}</Button>
            <button type="button" aria-label={tg('l7.more')} onClick={() => setMore((v) => !v)}>⋯</button>
            {more ? (
              <div className="l7-more" role="menu">
                <button type="button" onClick={() => { setMore(false); setExportIds(picked.length ? picked : null); setExportOpen(true) }}>
                  {picked.length ? tg('w5.exportSelected') : tg('w5.export')}
                </button>
                <button type="button" onClick={() => { setMore(false); window.dispatchEvent(new Event('aiss-import-share')) }}>{tg('w5.import')}</button>
              </div>
            ) : null}
            <button type="button" onClick={onClose}>{tg('common.close')}</button>
            {list.some((p) => isStaleDraft(p)) ? (
              <button type="button" onClick={() => setList((cur) => cur.filter((p) => !isStaleDraft(p)))}>{tg('w1.cleanStale')}</button>
            ) : null}
          </>
        }
      />
      <div className="workspace-panel-body">
        <div className="w9-seg" data-testid="w9-playbook-seg" role="tablist">
          {(['all', 'builtin', 'mine'] as const).map((id) => (
            <button key={id} type="button" aria-pressed={seg === id} onClick={() => setSeg(id)}>
              {tg(id === 'all' ? 'w9.all' : id === 'builtin' ? 'w9.sectionBuiltin' : 'w9.sectionMine')}
            </button>
          ))}
        </div>
        {list.length === 0 && seg !== 'builtin' ? (
          <EmptyState
            testId="playbooks-empty"
            icon={<Icon name="book-open" size={48} strokeWidth={1.5} />}
            title={tg('pf4.playbookTitle')}
            desc={tg('w9.tryHint')}
            primary={{ label: tg('pf4.playbookNew'), onClick: add }}
            secondary={builtins[0] ? [{
              label: tg('w9.try'),
              testId: 'w9-try-playbook',
              onClick: () => onEdit(builtins[0].id)
            }] : []}
          />
        ) : null}
        {showBuiltin ? builtins.map((p) => (
          <div key={p.id} className="m2-row" data-testid="w9-builtin-playbook" data-builtin="true">
            <div>
              <strong>{p.name}</strong>
              <span className="w9-badge" data-testid="w9-builtin-badge">{tg('w9.builtin')}</span>
              <div className="l7-meta">{tg('w9.sampleNoAuto')}</div>
              <div className="l7-meta w9-steps">
                {p.steps.map((step, index) => (
                  <span key={step.id}>{index + 1}. {step.title || step.command || step.type}</span>
                ))}
              </div>
            </div>
            <div className="workspace-panel-actions w9-row-actions">
              <button type="button" data-testid="w9-pb-preview" onClick={() => onEdit(p.id)}>{tg('w9.preview')}</button>
              <button type="button" data-testid="w9-pb-save-as" onClick={() => saveBuiltinAs(p)}>{tg('w9.saveAs')}</button>
            </div>
          </div>
        )) : null}
        {showUser ? shown.map((p) => (
          <div key={p.id} className="m2-row">
            <div>
              <label>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)))} />
              </label>
              <strong>{p.name}</strong>
              {dueIds.has(p.id) ? (
                <button
                  type="button"
                  className="w6-badge"
                  data-testid="w6-badge"
                  onClick={() => {
                    onRun(p.id)
                    window.setTimeout(() => window.dispatchEvent(new CustomEvent('aiss-focus-dry', { detail: { playbookId: p.id } })), 80)
                  }}
                >
                  {tg('w6.badge')}
                </button>
              ) : null}
              {p.draft ? <span className="w1-draft" data-testid="playbook-draft">{tg('w1.draft')}</span> : null}
              <div className="l7-meta">{p.steps.length} · {p.description}</div>
            </div>
            <div className="workspace-panel-actions">
              <button type="button" onClick={() => onEdit(p.id)}>{tg('ctx.edit')}</button>
              <Button variant="primary" onClick={() => onRun(p.id)} disabled={!profiles.length}>{tg('m2.run')}</Button>
              <button type="button" onClick={() => { setExportIds([p.id]); setExportOpen(true) }}>{tg('w5.exportOne')}</button>
            </div>
          </div>
        )) : null}
      </div>
      <ShareExportModal
        open={exportOpen}
        playbooks={exportIds ? list.filter((p) => exportIds.includes(p.id)) : list}
        hosts={profiles.map((p) => ({ title: p.label || p.host, tags: p.tags }))}
        appVersion="0.4.12"
        onClose={() => setExportOpen(false)}
      />
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
  const [pb, setPb] = useState<Playbook | null>(() => resolvePlaybook(playbookId))
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const edited = useRef(0)
  const locked = Boolean(pb && isBuiltinPlaybookId(pb.id))
  useEffect(() => {
    if (!pb || isBuiltinPlaybookId(pb.id)) return
    edited.current = Date.now()
    const timer = window.setTimeout(() => {
      if (Date.now() - edited.current >= AUTOSAVE_MS - 20) {
        const next = upsertPlaybook(loadPlaybooks(), { ...pb, updatedAt: Date.now() })
        persist(next)
      }
    }, AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [pb])
  const [reminder, setReminder] = useState(() => reminderFor(loadReminders(), playbookId))
  const saveReminder = (cadence: ReminderCadence) => {
    const next = setCadence(loadReminders(), playbookId, cadence)
    saveReminders(next)
    setReminder(reminderFor(next, playbookId))
    window.dispatchEvent(new Event('aiss-reminder-change'))
  }
  const snooze = () => {
    const next = snoozeReminder(loadReminders(), playbookId)
    saveReminders(next)
    setReminder(reminderFor(next, playbookId))
    window.dispatchEvent(new Event('aiss-reminder-change'))
  }
  if (!pb) return <div className="workspace-panel"><p>{tg('m2.missing')}</p></div>
  const patchStep = (id: string, patch: Partial<PlaybookStep>) => {
    setPb({ ...pb, steps: pb.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }
  return (
    <div className="workspace-panel pb2" data-testid="playbook-edit" data-builtin={locked ? 'true' : 'false'}>
      {/* PB2: header = playbook name + badge; actions on the right, "运行" is the primary button */}
      <PanelHeader
        title={
          <span className="pb2-title">
            <span className="pb2-title-name">{pb.name || tg('m2.edit')}</span>
            {locked ? <span className="w9-badge">{tg('w9.builtin')}</span> : null}
            {pb.draft ? <span className="w9-badge">{tg('pb2.draft')}</span> : null}
          </span>
        }
        actions={
          <>
            {pb.draft ? (
              <button
                type="button"
                onClick={() => {
                  const next = loadPlaybooks().filter((p) => p.id !== pb.id)
                  persist(next)
                  showToast(tg('w1.discarded'))
                  onClose()
                }}
              >
                {tg('w1.discard')}
              </button>
            ) : null}
            <button type="button" title={tg('pb2.exportTip')} onClick={() => void navigator.clipboard.writeText(exportPlaybook(pb)).then(() => showToast(tg('pb2.exported')))}>{tg('m2.export')}</button>
            {locked ? (
              <button
                type="button"
                data-testid="w9-pb-save-as"
                onClick={() => {
                  const copy = saveAsPlaybook(pb)
                  persist(upsertPlaybook(loadPlaybooks(), copy))
                  showToast(tg('w9.savedAs', { name: copy.name }))
                }}
              >
                {tg('w9.saveAs')}
              </button>
            ) : null}
            {pb.draft ? (
              <Button variant="primary"
                data-testid="w1-save-as"
                onClick={() => {
                  const next = promoteDraft({ ...pb, vars: discoverVars(pb) })
                  setPb(next)
                  persist(upsertPlaybook(loadPlaybooks(), next))
                  showToast(tg('w1.saved'))
                }}
              >
                {tg('w1.saveAs')}
              </Button>
            ) : (
              <Button variant="primary" data-testid="pb2-run" onClick={() => onRun(pb.id)}>{tg('m2.run')}</Button>
            )}
          </>
        }
      />
      <div className="workspace-panel-body m2-form pb2-body">
        {locked ? (
          <div className="w1-banner pb2-locked" data-testid="w9-playbook-locked" role="note">
            <Icon name="lock" size={14} />
            <span>{tg('pb2.lockedWhy')}</span>
          </div>
        ) : null}
        {pb.origin ? (
          <div className="w1-banner" data-testid="w1-banner" title={pb.origin.hostTitle}>
            {pb.origin.kind === 'error'
              ? tg('w1.bannerError', { host: pb.origin.hostTitle, time: new Date(pb.origin.at).toLocaleTimeString() })
              : tg('w1.banner', { host: pb.origin.hostTitle, rule: pb.origin.ruleId || '', time: new Date(pb.origin.at).toLocaleTimeString() })}
          </div>
        ) : null}
        <section className="pb2-section">
          <label className="pb2-field">
            <span className="pb2-label">{tg('m2.name')}</span>
            <input value={pb.name} readOnly={locked} onChange={(e) => setPb({ ...pb, name: e.target.value })} aria-label={tg('m2.name')} />
          </label>
          <label className="pb2-field">
            <span className="pb2-label">{tg('m2.desc')}</span>
            <input value={pb.description} readOnly={locked} onChange={(e) => setPb({ ...pb, description: e.target.value })} aria-label={tg('m2.desc')} placeholder={locked ? undefined : tg('pb2.descPh')} />
          </label>
        </section>
        <section className="pb2-section w2-vars" data-testid="w2-vars">
          <h3 className="pb2-h">{tg('w2.varsN', { n: (pb.vars ?? []).length })}</h3>
          {(pb.vars ?? []).length === 0 ? <p className="pb2-empty">{tg('w2.varsEmptyHint')}</p> : null}
          {(pb.vars ?? []).map((v) => (
            <div key={v.name} className="w2-var-row">
              <code>{v.name}</code>
              <span>{v.label || ''}</span>
              <input
                aria-label={tg('w2.col.default')}
                readOnly={locked}
                value={v.sensitive ? '' : v.defaultValue ?? ''}
                placeholder={v.sensitive ? '••••' : ''}
                onChange={(e) => {
                  const vars = (pb.vars ?? []).map((row) => (row.name === v.name ? { ...row, defaultValue: row.sensitive ? undefined : e.target.value } : row))
                  setPb({ ...pb, vars })
                }}
              />
              {v.unused ? <span>{tg('w2.unused')}</span> : null}
            </div>
          ))}
        </section>
        <section className="pb2-section">
          <h3 className="pb2-h">{tg('pb2.stepsN', { n: pb.steps.length })}</h3>
          <ol className="pb2-steps">
            {pb.steps.map((step, i) => (
              <li
                key={step.id}
                className={`pb2-card m2-step${dragFrom === i ? ' is-dragging' : ''}`}
                data-testid="pb2-step"
                onDragOver={(e) => {
                  if (dragFrom == null || locked) return
                  e.preventDefault()
                }}
                onDrop={(e) => {
                  if (dragFrom == null || locked) return
                  e.preventDefault()
                  setPb({ ...pb, steps: moveStep(pb.steps, dragFrom, i) })
                  setDragFrom(null)
                }}
              >
                <div className="pb2-card-head">
                  {locked ? null : (
                    <span
                      className="pb2-handle"
                      draggable
                      role="button"
                      tabIndex={0}
                      data-testid="pb2-handle"
                      title={tg('pb2.dragTip')}
                      aria-label={tg('pb2.dragTip')}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        setDragFrom(i)
                      }}
                      onDragEnd={() => setDragFrom(null)}
                      onKeyDown={(e) => {
                        // keyboard reorder: Alt+↑ / Alt+↓ (or ↑ / ↓ on the handle)
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                        e.preventDefault()
                        const to = e.key === 'ArrowUp' ? i - 1 : i + 1
                        if (to < 0 || to >= pb.steps.length) return
                        setPb({ ...pb, steps: moveStep(pb.steps, i, to) })
                      }}
                    >
                      ⋮⋮
                    </span>
                  )}
                  <span className="pb2-no">{i + 1}</span>
                  <Select
                    className="pb2-type"
                    disabled={locked}
                    ariaLabel={tg('pb2.type')}
                    value={step.type}
                    onChange={(v) => patchStep(step.id, { type: v as PlaybookStep['type'] })}
                    options={[
                      { value: 'command', label: tg('m2.stepCommand') },
                      { value: 'snippet', label: tg('m2.stepSnippet') },
                      { value: 'toolbox', label: tg('m2.stepToolbox') }
                    ]}
                  />
                  <span className="pb2-grow" />
                  {locked ? null : (
                    <>
                      <button type="button" className="pb2-icon" data-testid="pb2-dup" title={tg('pb2.dup')} aria-label={tg('pb2.dup')} onClick={() => setPb({ ...pb, steps: [...pb.steps.slice(0, i + 1), { ...step, id: blankStep().id }, ...pb.steps.slice(i + 1)] })}>
                        <Icon name="clipboard-list" size={14} />
                      </button>
                      <button type="button" className="pb2-icon is-danger" data-testid="pb2-del" title={tg('app.delete')} aria-label={tg('app.delete')} onClick={() => {
                        // PB3: delete with undo (restores the step at its old position)
                        setPb((cur) => (cur ? { ...cur, steps: cur.steps.filter((s) => s.id !== step.id) } : cur))
                        toastUndo({
                          message: tg('pb2.deleted', { n: i + 1 }),
                          undo: () => setPb((cur) => (cur && !cur.steps.some((s) => s.id === step.id) ? { ...cur, steps: [...cur.steps.slice(0, i), step, ...cur.steps.slice(i)] } : cur))
                        })
                      }}>
                        <Icon name="x" size={14} />
                      </button>
                    </>
                  )}
                </div>
                {step.type === 'toolbox' ? (
                  <p className="l4-soon">{tg('m2.toolboxSoon')}</p>
                ) : step.type === 'snippet' ? (
                  <Select
                    disabled={locked}
                    ariaLabel={tg('m2.pickSnippet')}
                    value={step.snippetId ?? ''}
                    placeholder={tg('m2.pickSnippet')}
                    onChange={(v) => patchStep(step.id, { snippetId: v })}
                    options={[{ value: '', label: tg('m2.pickSnippet') }, ...snippets.map((s) => ({ value: s.id, label: s.title }))]}
                  />
                ) : (
                  <textarea className="pb2-cmd" spellCheck={false} aria-label={tg('m2.stepCommand')} readOnly={locked} value={step.command ?? ''} onChange={(e) => patchStep(step.id, { command: e.target.value })} rows={2} />
                )}
                <div className="pb2-opts">
                  <label className="pb2-check" title={step.lockedConfirm ? tg('w1.lockedConfirm') : tg('pb2.confirmTip')}>
                    <input type="checkbox" checked={step.confirm || Boolean(step.lockedConfirm)} disabled={locked || Boolean(step.lockedConfirm)} onChange={(e) => patchStep(step.id, { confirm: e.target.checked })} />
                    <span>{tg('m2.confirmStep')}</span>
                    {step.lockedConfirm ? <Icon name="lock" size={12} /> : null}
                  </label>
                  <label className="pb2-check" title={tg('pb2.stopTip')}>
                    <input type="checkbox" checked={step.stopOnError} disabled={locked} onChange={(e) => patchStep(step.id, { stopOnError: e.target.checked })} />
                    <span>{tg('m2.stopOnError')}</span>
                  </label>
                  {step.checkPlaceholder ? <span className="l4-soon">{tg('w1.checkPlaceholder')}</span> : null}
                  <span className="pb2-grow" />
                  <label className="pb2-timeout">
                    <span>{tg('pb2.timeout')}</span>
                    <input type="number" min={1} max={600} value={step.timeoutSec} readOnly={locked} aria-label={tg('m2.timeout')} onChange={(e) => patchStep(step.id, { timeoutSec: Number(e.target.value) || 60 })} />
                    <span className="pb2-suffix">{tg('pb2.sec')}</span>
                  </label>
                </div>
              </li>
            ))}
          </ol>
          {locked ? null : (
            <button type="button" className="pb2-add" data-testid="pb2-add" onClick={() => setPb({ ...pb, steps: [...pb.steps, blankStep()] })}>
              <Icon name="plus" size={14} />
              <span>{tg('m2.addStep')}</span>
            </button>
          )}
        </section>

        {locked ? null : <section className="w6-section" data-testid="w6-reminder">
          <h3>{tg('w6.section')}</h3>
          <label>
            {tg('w6.period')}
            {/* PB3: themed Select (no native drop-down) */}
            <Select
              testId="w6-cadence"
              ariaLabel={tg('w6.period')}
              value={reminder.cadence}
              onChange={(v) => saveReminder(v as ReminderCadence)}
              options={REMINDER_CADENCES.map((c) => ({ value: c, label: tg(c === 'off' ? 'w6.off' : c === 'weekly' ? 'w6.weekly' : c === 'biweekly' ? 'w6.biweekly' : 'w6.monthly') }))}
            />
          </label>
          {reminder.cadence !== 'off' && reminder.nextDueAt ? (
            <span data-testid="w6-next">{tg('w6.next')} {new Date(reminder.nextDueAt).toLocaleString()}</span>
          ) : null}
          <p className="l7-muted">{tg('w6.hint')}</p>
          {reminder.cadence !== 'off' ? (
            <button type="button" data-testid="w6-snooze" onClick={snooze}>{tg('w6.snooze')}</button>
          ) : null}
          {typeof Notification !== 'undefined' && Notification.permission === 'denied' ? <p className="l7-muted">{tg('w6.needNotif')}</p> : null}
        </section>}
      </div>
    </div>
  )
}

export function PlaybookRun({
  playbookId,
  profiles,
  live,
  snippets: snippetsProp,
  sessionReadonly,
  onResult,
  onClose
}: {
  playbookId: string
  profiles: SavedSessionProfile[]
  live: Map<string, string>
  snippets?: CommandSnippet[]
  sessionReadonly?: Readonly<Record<string, boolean>>
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
  const playbook = useMemo(() => resolvePlaybook(playbookId), [playbookId])
  const hosts = useMemo(() => hostsFrom(profiles, live, sessionReadonly), [profiles, live, sessionReadonly])
  const [picked, setPicked] = useState<string[]>(() => initialHostIds({ targetHint: playbook?.targetHint }))
  const [mode, setMode] = useState<'parallel' | 'serial'>('parallel')
  const [limit, setLimit] = useState(DEFAULT_PARALLEL)
  const [running, setRunning] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const v of playbook?.vars ?? []) if (!v.sensitive && v.defaultValue) init[v.name] = v.defaultValue
    return init
  })
  const [remember, setRemember] = useState(false)
  const [dry, setDry] = useState<DryRunResult | null>(null)
  const [dryKey, setDryKey] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDry = () => {
      const layer = rootRef.current?.closest('.terminal-layer')
      if (!layer?.classList.contains('active')) return
      rootRef.current?.querySelector<HTMLButtonElement>('[data-testid="w2-dry"]')?.click()
    }
    window.addEventListener('aiss-dry-run', onDry)
    const onFocus = (ev: Event) => {
      const id = (ev as CustomEvent<{ playbookId?: string }>).detail?.playbookId
      if (id && id !== playbookId) return
      const layer = rootRef.current?.closest('.terminal-layer')
      if (layer && !layer.classList.contains('active')) return
      const btn = rootRef.current?.querySelector<HTMLButtonElement>('[data-testid="w2-dry"]')
      btn?.focus()
      btn?.classList.add('is-highlight')
    }
    window.addEventListener('aiss-focus-dry', onFocus)
    return () => {
      window.removeEventListener('aiss-dry-run', onDry)
      window.removeEventListener('aiss-focus-dry', onFocus)
    }
  }, [playbookId])
  if (!playbook) return <div className="workspace-panel"><p>{tg('m2.missing')}</p></div>
  const selected = hosts.filter((h) => picked.includes(h.id))
  const runnable = selected.filter(hostSelectable)
  const keyNow = JSON.stringify({ picked, values, mode, limit })
  const fresh = Boolean(dry) && dryKey === keyNow
  const prodCount = runnable.filter((h) => h.level === 'production').length
  const runDry = () => {
    const result = dryRunPlaybook({ playbook, hosts: selected, values, snippets, online: (h) => Boolean(h.sessionId) })
    setDry(result)
    setDryKey(keyNow)
    appendAudit({
      type: 'playbook.dryrun',
      host: playbook.name,
      source: 'playbook',
      outcome: 'allowed',
      detail: `${playbook.name} hosts=${result.summary.runnableHosts} confirm=${result.summary.confirms}`,
      alertId: playbook.origin?.alertId
    })
    if (playbook.origin?.alertId) {
      appendTimeline({
        alertId: playbook.origin.alertId,
        kind: 'playbook.dryrun',
        hostKey: playbook.origin.hostKey,
        summary: `${result.summary.runnableHosts} hosts`
      })
    }
    saveReminders(noteDryRun(loadReminders(), playbook.id))
    window.dispatchEvent(new Event('aiss-reminder-change'))
  }
  const start = async () => {
    for (const host of selected) {
      if (host.level !== 'readonly') continue
      appendGate({
        host: host.name,
        hostKey: host.id,
        protection: 'readonly',
        gateRule: 'readonlyWrite',
        gateResult: 'blocked',
        summary: playbook.name,
        playbookId: playbook.id,
        alertId: playbook.origin?.alertId,
        source: 'playbook'
      })
    }
    setRunning(true)
    const result = await runPlaybook({
      playbook,
      hosts: runnable,
      mode,
      parallelLimit: clampParallel(limit),
      snippets,
      values,
      confirm: async (req) => {
        if (req.requireHostName) {
          const typed = await askText(tg('l4.typeHost', { host: req.host.name }), '')
          const name = (typed ?? '').trim()
          if (name !== req.host.name && name !== req.host.host) {
            appendGate({
              host: req.host.name,
              hostKey: req.host.id,
              protection: req.host.level,
              gateRule: 'prod',
              gateResult: typed == null ? 'cancelled' : 'denied',
              summary: req.command,
              playbookId: playbook.id,
              alertId: playbook.origin?.alertId,
              source: 'playbook'
            })
            return 'skip'
          }
        }
        const ok = await askConfirm(tg('m2.confirmTitle'), req.command, {
          id: 'confirm.playbookDestructive',
          danger: true,
          okLabel: req.requireHostName ? tg('confirm.runProd') : req.dangerous ? tg('risk.run') : tg('confirm.runStep')
        })
        const ran = ok ? 'run' : 'skip'
        appendGate({
          host: req.host.name,
          hostKey: req.host.id,
          protection: req.host.level,
          gateRule: req.requireHostName ? 'prod' : req.dangerous ? 'danger' : 'playbook',
          gateResult: ran === 'run' ? 'confirmed' : 'cancelled',
          summary: req.command,
          playbookId: playbook.id,
          alertId: playbook.origin?.alertId,
          source: 'playbook'
        })
        return ran
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
      detail: `${playbook.name} ${result.cells.filter((c) => c.state === 'ok').length}/${result.cells.length} ${auditVarDetail(playbook, values)}`.trim(),
      alertId: playbook.origin?.alertId
    })
    if (playbook.origin?.alertId) {
      appendTimeline({
        alertId: playbook.origin.alertId,
        kind: 'playbook.run',
        hostKey: playbook.origin.hostKey,
        summary: `${playbook.name} ${result.cells.filter((c) => c.state === 'ok').length}/${result.cells.length}`
      })
    }
    if (!isBuiltinPlaybookId(playbook.id)) {
      const promoted = promoteDraft(playbook)
      const vars = remember
        ? (promoted.vars ?? []).map((v) => (v.sensitive ? v : { ...v, defaultValue: values[v.name] ?? v.defaultValue }))
        : promoted.vars
      const saved = loadPlaybooks().map((p) => (p.id === playbook.id ? { ...promoted, vars, lastRunAt: Date.now(), draft: undefined } : p))
      persist(saved)
    }
    setRunning(false)
    onResult(result)
  }
  return (
    <div className="workspace-panel" data-testid="playbook-run" data-auto-run="false" data-builtin={isBuiltinPlaybookId(playbook.id) ? 'true' : 'false'} ref={rootRef}>
      <PanelHeader
        title={playbook.name}
        actions={
          <>
            {playbookRunDisabled(selected.map((h) => h.level)) ? (
              <>
                <button type="button" data-testid="w2-dry" disabled={running || !selected.length || !playbook.steps.length} onClick={runDry}>
                  {tg('w2.dryRun')}
                </button>
                <Button variant="primary" data-testid="w2-start" disabled title={tg('s4.runDisabled')}>
                  {tg('w2.start')}
                </Button>
              </>
            ) : fresh && dry?.okToStart ? (
              <Button variant="primary" data-testid="w2-start" disabled={running} onClick={() => void start()}>
                {prodCount ? tg('w2.startProd', { k: prodCount }) : tg('w2.start')}
              </Button>
            ) : (
              <Button variant="primary" data-testid="w2-dry" disabled={running || !selected.length || !playbook.steps.length} title={!selected.length ? tg('w2.needHosts') : undefined} onClick={runDry}>
                {tg('w2.dryRun')}
              </Button>
            )}
          </>
        }
      />
      <div className="workspace-panel-body m2-form">
        {isBuiltinPlaybookId(playbook.id) ? (
          <div className="w1-banner" data-testid="w9-run-note">
            <span className="w9-badge">{tg('w9.builtin')}</span>
            <span>{tg('w9.sampleNoAuto')}</span>
          </div>
        ) : null}
        <div className="l2-filters" data-testid="w2-hosts">
          <span>{tg('w2.hostsN', { n: selected.length })}</span>
          {!selected.length ? <span className="l7-muted">{tg('w2.noHosts')}</span> : null}
        </div>
        {hosts.map((h) => (
          <label key={h.id} className="l4-check">
            <input
              type="checkbox"
              checked={picked.includes(h.id)}
              onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, h.id] : cur.filter((id) => id !== h.id)))}
            />
            {h.name}
            {h.level === 'readonly' ? <span className="l4-soon">{tg('l4.readonly')}</span> : null}
            {!h.sessionId ? <span className="l7-meta">{tg('m2.offline')}</span> : null}
          </label>
        ))}
        <div data-testid="w2-params">
          {(playbook.vars ?? []).map((v: PlaybookVar) => (
            <label key={v.name} className="l4-check">
              {v.label || v.name}{v.required ? '*' : ''}
              <input
                type={v.sensitive ? 'password' : 'text'}
                value={values[v.name] ?? ''}
                onChange={(e) => setValues((cur) => ({ ...cur, [v.name]: e.target.value }))}
              />
            </label>
          ))}
          <label className="l4-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{tg('w2.remember')}</label>
        </div>
        <div className="l2-filters">
          <label className="l4-check"><input type="radio" checked={mode === 'parallel'} onChange={() => setMode('parallel')} />{tg('m2.parallel')}</label>
          <label className="l4-check"><input type="radio" checked={mode === 'serial'} onChange={() => setMode('serial')} />{tg('m2.serial')}</label>
          <label className="l4-check">{tg('m2.limit')}<input type="number" min={1} max={32} value={limit} onChange={(e) => setLimit(clampParallel(Number(e.target.value)))} /></label>
        </div>
        {dry && fresh ? (
          <div data-testid="w2-dry-result">
            <p>{tg('w2.nothingSent')}</p>
            {dry.rows.map((row, i) => (
              <div key={`${row.hostId}-${row.stepId ?? i}`} className="m2-preview-line">
                <code>{row.display || '—'}</code>
                <span>{tg(`w2.v.${row.verdict === 'typeHost' ? 'typeHost' : row.verdict}` as 'w2.v.direct')}</span>
              </div>
            ))}
            <p>{tg('w2.summary', { a: dry.summary.steps, c: dry.summary.confirms, h: dry.summary.hostNameChecks, b: dry.summary.blockedHosts })}</p>
            {dry.summary.missing ? <p>{tg('w2.missingN', { n: dry.summary.missing })}</p> : null}
          </div>
        ) : dry && !fresh ? <p data-testid="w2-stale">{tg('w2.stale')}</p> : null}
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
      <PanelHeader
        title={result.name}
        actions={
          <>
            <button type="button" onClick={() => void window.aiss.files.saveText(`${result.name}.md`, md)}>{tg('m2.export')}</button>
          </>
        }
      />
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
