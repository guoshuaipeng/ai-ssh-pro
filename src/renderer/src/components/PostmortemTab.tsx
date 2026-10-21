import { useMemo, useState } from 'react'
import Select from './ui/Select'
import { DEFAULT_POSTMORTEM, renderPostmortem, type PostmortemOptions, type TimelineAlert, type TimelineEvent } from '@shared/timeline'
import { tg } from '../lib/i18n'
import { showToast } from '../lib/toast'
import PanelHeader from './ui/PanelHeader'
import Button from './ui/Button'

type Props = {
  alert: TimelineAlert
  events: TimelineEvent[]
  version: string
}

export default function PostmortemTab({ alert, events, version }: Props) {
  const [opts, setOpts] = useState<PostmortemOptions>({ ...DEFAULT_POSTMORTEM, version })
  const rendered = useMemo(() => renderPostmortem(alert, events, opts), [alert, events, opts])
  const set = (patch: Partial<PostmortemOptions>) => setOpts((cur) => ({ ...cur, ...patch }))
  const save = async () => {
    const host = opts.aliasHosts ? 'host-A' : alert.hostTitle
    const name = `postmortem-${host}-${alert.ruleId}.md`
    try {
      const file = await window.aiss.files.saveText(name, rendered.markdown)
      if (file) showToast(tg('w4.exported', { file }))
    } catch (e) {
      showToast(tg('w4.exportFail', { msg: e instanceof Error ? e.message : String(e) }), { kind: 'error' })
    }
  }
  return (
    <div className="workspace-panel w4-post" data-testid="postmortem">
      <PanelHeader
        title={
          <>
            {tg('w4.tab', { host: alert.hostTitle, rule: alert.ruleId })}
          </>
        }
        actions={
          <>
            <Button variant="primary" data-testid="w4-save" onClick={() => void save()}>{tg('w4.save')}</Button>
            <button type="button" onClick={() => void navigator.clipboard.writeText(rendered.markdown)}>{tg('w4.copy')}</button>
          </>
        }
      />
      <div className="w4-split">
        <div className="w4-opts" data-testid="w4-options">
          <p className="l7-meta">{tg('w4.opt.secrets')}</p>
          <label className="l4-check"><input type="checkbox" checked={opts.aliasHosts} onChange={(e) => set({ aliasHosts: e.target.checked })} />{tg('w4.opt.hosts')}</label>
          <label className="l4-check"><input type="checkbox" checked={opts.aliasUsers} onChange={(e) => set({ aliasUsers: e.target.checked })} />{tg('w4.opt.users')}</label>
          <label className="l4-check"><input type="checkbox" checked={opts.aliasIps} onChange={(e) => set({ aliasIps: e.target.checked })} />{tg('w4.opt.ips')}</label>
          <label className="l4-check"><input type="checkbox" checked={opts.concurrent} onChange={(e) => set({ concurrent: e.target.checked })} />{tg('w4.showConcurrent')}</label>
          <label className="l4-check"><input type="checkbox" checked={opts.aiCause} onChange={(e) => set({ aiCause: e.target.checked })} />{tg('w4.opt.cause')}</label>
          <label className="l4-check"><input type="checkbox" checked={opts.commandOutput} onChange={(e) => set({ commandOutput: e.target.checked })} />{tg('w4.opt.output')}</label>
          <label className="l4-check"><input type="checkbox" checked={opts.fileDiff} onChange={(e) => set({ fileDiff: e.target.checked })} />{tg('w4.opt.diff')}</label>
          <label className="l4-check"><input type="checkbox" checked={opts.notes} onChange={(e) => set({ notes: e.target.checked })} />{tg('w4.opt.notes')}</label>
          <label className="l4-check">
            {tg('w4.opt.lang')}
            <Select testId="w4-lang" value={opts.lang} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]} onChange={(v) => set({ lang: v === 'en' ? 'en' : 'zh' })} />
          </label>
          <p className="l7-muted">{tg('w4.aliasLocal')}</p>
        </div>
        <pre className="w4-preview" data-testid="w4-preview">{rendered.markdown}</pre>
      </div>
    </div>
  )
}
