import { useMemo, useState } from 'react'
import Modal from './Modal'
import { isDemoSessionId } from '@shared/demo-host'
import { INSPECT_CHECKS, DEMO_INSPECT_OUTPUT, type InspectCheckId } from '@shared/inspect-cmds'
import { useI18n } from '../lib/i18n'
import { friendlyErrorMessage } from '../lib/friendly-error'
import { showToast } from '../lib/toast'
import Button from './ui/Button'

export type InspectHost = { sessionId: string; title: string; demo?: boolean }

export type InspectReport = {
  id: string
  at: number
  hosts: Array<{ title: string; sessionId: string; ok: boolean; score?: number; markdown: string; error?: string }>
  summaryMarkdown: string
}

type Props = {
  open: boolean
  hosts: InspectHost[]
  initialSelected?: string[]
  aiConfigured: boolean
  onClose: () => void
  onOpenAiSettings: () => void
  onDone: (report: InspectReport) => void
}

function heuristicReport(title: string, collected: Record<string, string>, _locale: string): { score: number; markdown: string } {
  const issues: string[] = []
  let score = 100
  const disk = collected.disk || ''
  if (/\b(9\d|100)%/.test(disk)) {
    score -= 25
    issues.push('- **Critical**: disk usage >= 90%')
  } else if (/\b8\d%/.test(disk)) {
    score -= 10
    issues.push('- **Warning**: elevated disk usage')
  }
  const systemd = collected.systemd || ''
  if (/failed/i.test(systemd) && !/0 loaded units listed/i.test(systemd)) {
    score -= 20
    issues.push('- **Warning**: failed systemd units')
  }
  const sec = collected.security || ''
  if (/PermitRootLogin\s+yes/i.test(sec)) {
    score -= 15
    issues.push('- **Warning**: PermitRootLogin yes')
  }
  if (/PasswordAuthentication\s+yes/i.test(sec)) {
    score -= 5
    issues.push('- **Note**: PasswordAuthentication yes')
  }
  if (!issues.length) issues.push('- **OK**: no major issues found')
  const md = [
    `# ${title}`,
    '',
    `**Score**: ${Math.max(0, score)}`,
    '',
    '## Findings',
    ...issues,
    '',
    '## Suggested commands',
    '- `df -h`',
    '- `systemctl --failed`',
    '- `free -h`',
    '',
    '## Disk snapshot',
    '```',
    disk.slice(0, 800) || '(empty)',
    '```'
  ].join('\n')
  return { score: Math.max(0, score), markdown: md }
}

export default function InspectWizard({
  open,
  hosts,
  initialSelected,
  aiConfigured,
  onClose,
  onOpenAiSettings,
  onDone
}: Props) {
  const { t, locale } = useI18n()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected?.length ? initialSelected : hosts.slice(0, 5).map((h) => h.sessionId))
  )
  const [checks, setChecks] = useState<Record<InspectCheckId, boolean>>(() => {
    const o = {} as Record<InspectCheckId, boolean>
    for (const c of INSPECT_CHECKS) o[c.id] = c.defaultOn
    return o
  })
  const [showCmds, setShowCmds] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string[]>([])

  const activeChecks = useMemo(() => INSPECT_CHECKS.filter((c) => checks[c.id]), [checks])
  const n = selected.size

  if (!open) return null

  const run = async () => {
    if (n < 1) return
    setRunning(true)
    setProgress([])
    const hostList = hosts.filter((h) => selected.has(h.sessionId))
    const reports: InspectReport['hosts'] = []
    for (const h of hostList) {
      setProgress((p) => [...p, t('a3.collecting', { host: h.title })])
      const collected: Record<string, string> = {}
      try {
        for (const c of activeChecks) {
          if (h.demo || isDemoSessionId(h.sessionId)) {
            collected[c.id] = DEMO_INSPECT_OUTPUT[c.id]
            continue
          }
          const res = await window.aiss.workspace.batchExec({
            sessionIds: [h.sessionId],
            command: c.cmd,
            timeoutMs: 25000
          })
          const one = res.results[0]
          collected[c.id] = one?.ok ? one.stdout : `${one?.stderr || ''}\n${one?.error || ''}`.trim() || 'failed'
        }
        setProgress((p) => [...p, t('a3.analyzing', { host: h.title })])
        let { score, markdown } = heuristicReport(h.title, collected, locale)
        if (aiConfigured) {
          try {
            const blob = Object.entries(collected)
              .map(([k, v]) => `### ${k}\n${v.slice(0, 1500)}`)
              .join('\n\n')
            const r = await window.aiss.ai.assist({
              requestId: `insp-${h.sessionId}-${Date.now()}`,
              kind: 'explainError',
              text: blob,
              host: h.title,
              locale
            })
            if (r.ok && r.kind === 'explainError') {
              const fixes = r.fixes.map((f) => `- \`${f.command}\`${f.note ? ` — ${f.note}` : ''}`).join('\n')
              markdown += `\n\n## AI\n${r.cause}\n\n${fixes}\n`
            }
          } catch {
            /* keep heuristic */
          }
        }
        reports.push({ title: h.title, sessionId: h.sessionId, ok: true, score, markdown })
      } catch (e) {
        reports.push({
          title: h.title,
          sessionId: h.sessionId,
          ok: false,
          markdown: '',
          error: friendlyErrorMessage(e, locale === 'en' ? 'en' : 'zh-CN')
        })
      }
    }
    const summary = [
      `# ${t('a3.reportTitle')}`,
      '',
      `${t('a3.hostCount', { n: reports.length })} · ${new Date().toLocaleString()}`,
      '',
      ...reports.map((r) => (r.ok ? r.markdown : `## ${r.title}\n\n${t('a3.failed')}: ${r.error}`))
    ].join('\n')
    const report: InspectReport = { id: `insp-${Date.now()}`, at: Date.now(), hosts: reports, summaryMarkdown: summary }
    setRunning(false)
    showToast(t('a3.done', { n: reports.filter((x) => x.ok).length }), { kind: 'info' })
    onDone(report)
    onClose()
  }

  return (
    <Modal open title={t('a3.wizardTitle')} onClose={running ? () => undefined : onClose} width={520} testId="inspect-wizard">
      <div className="o2-body">
        {!aiConfigured ? <p className="o2-hint">{t('a3.aiOptional')}</p> : null}
        <h3 className="o2-hint">{t('a3.pickHosts')}</h3>
        <ul className="x3-list">
          {hosts.map((h) => (
            <li key={h.sessionId}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(h.sessionId)}
                  disabled={running}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(h.sessionId)
                      else next.delete(h.sessionId)
                      return next
                    })
                  }}
                />
                {h.title}
              </label>
            </li>
          ))}
        </ul>
        <h3 className="o2-hint">{t('a3.pickChecks')}</h3>
        <div className="o2-notify">
          {INSPECT_CHECKS.map((c) => (
            <label key={c.id} className="o2-check">
              <input
                type="checkbox"
                checked={checks[c.id]}
                disabled={running}
                onChange={(e) => setChecks((prev) => ({ ...prev, [c.id]: e.target.checked }))}
              />
              {locale === 'zh-CN' ? c.zh : c.en}
            </label>
          ))}
        </div>
        <button type="button" className="linkish" onClick={() => setShowCmds((v) => !v)}>
          {t('a3.showCmds')}
        </button>
        {showCmds ? <pre className="a3-cmds">{activeChecks.map((c) => `# ${c.id}\n${c.cmd}`).join('\n\n')}</pre> : null}
        <p className="o2-hint">{t('a3.readonly', { n })}</p>
        {progress.length ? (
          <ul className="a3-progress" data-testid="a3-progress">
            {progress.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ) : null}
        <div className="modal-actions">
          {!aiConfigured ? (
            <button type="button" onClick={onOpenAiSettings}>
              {t('a3.goAi')}
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <button type="button" disabled={running} onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <Button variant="primary" disabled={running || n < 1 || activeChecks.length < 1} onClick={() => void run()}>
            {running ? t('a3.running') : t('a3.start', { n })}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
