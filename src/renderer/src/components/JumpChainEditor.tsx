import { useState } from 'react'
import type { SavedSessionProfile } from '@shared/ipc'
import { canAddHop, chainDiagram, formatProxyJump, parseProxyJump, validateChain, type HopProbeRow, type JumpHop } from '@shared/jump-chain'
import { tg } from '../lib/i18n'
import { askText } from '../lib/dialogs'

export default function JumpChainEditor({
  hops,
  targetHost,
  profiles,
  onChange,
  onTest
}: {
  hops: JumpHop[]
  targetHost: string
  profiles: SavedSessionProfile[]
  onChange: (hops: JumpHop[]) => void
  onTest?: () => Promise<HopProbeRow[]>
}) {
  const known = new Set(profiles.map((p) => p.id))
  const issues = validateChain(hops, targetHost, known)
  const diagram = chainDiagram(hops, targetHost, known)
  const [probe, setProbe] = useState<HopProbeRow[] | null>(null)
  const [probing, setProbing] = useState(false)
  const setHop = (index: number, patch: Partial<JumpHop>) => {
    onChange(hops.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }
  return (
    <div className="jump-chain" data-testid="jump-chain">
      <div className="jump-chain-head">
        <strong>{hops.length ? tg('m2.jumpTitleN', { n: hops.length }) : tg('m2.jumpTitle')}</strong>
        <span className="l7-meta">{hops.length}/5</span>
      </div>
      {hops.length ? null : <p className="l4-hint">{tg('m2.direct')}</p>}
      <div className="jump-chips" data-testid="jump-chips">
        {diagram.map((chip, i) => (
          <span key={chip.id} className="jump-chip-wrap">
            {i > 0 ? <span className="jump-arrow" aria-hidden>→</span> : null}
            <span
              className={`jump-chip${chip.role === 'target' ? ' is-target' : ''}${chip.deleted || chip.cycle || probe?.some((row) => !row.ok && row.hop === i) ? ' is-bad' : ''}`}
              title={chip.role === 'local' ? tg('m2.thisComputer') : chip.label || tg('m2.hopEmpty')}
            >
              {chip.role === 'local' ? tg('m2.thisComputer') : chip.role === 'target' ? chip.label || tg('m2.target') : chip.label || '…'}
            </span>
          </span>
        ))}
      </div>
      {hops.map((hop, i) => (
        <div key={hop.id} className="jump-hop">
          <div className="jump-hop-title">
            <span>{tg('m2.hopN', { n: i + 1 })}</span>
            <button type="button" onClick={() => onChange(hops.filter((_, j) => j !== i))}>
              {tg('app.delete')}
            </button>
          </div>
          <div className="field-row2">
            <input value={hop.host} placeholder={tg('ui.51')} onChange={(e) => setHop(i, { host: e.target.value })} aria-label={tg('ui.51')} />
            <input value={String(hop.port || 22)} onChange={(e) => setHop(i, { port: Number(e.target.value) || 22 })} aria-label={tg('ui.44')} />
          </div>
          <input value={hop.username} placeholder={tg('ui.45')} onChange={(e) => setHop(i, { username: e.target.value })} aria-label={tg('ui.45')} />
          <select
            value={hop.auth || 'key'}
            onChange={(e) => setHop(i, { auth: e.target.value as JumpHop['auth'] })}
            aria-label={tg('conn.groupAuth')}
          >
            <option value="key">{tg('conn.authKey')}</option>
            <option value="password">{tg('conn.authPassword')}</option>
            <option value="agent">{tg('m2.authAgent')}</option>
          </select>
          {issues.filter((x) => 'hop' in x && x.hop === i + 1).map((x) => (
            <p key={x.code} className="jump-issue">
              {tg(x.code === 'deleted' ? 'm2.hopDeleted' : x.code === 'cycle' ? 'm2.hopCycle' : 'm2.hopEmpty')}
            </p>
          ))}
        </div>
      ))}
      <div className="jump-chain-actions">
        <button
          type="button"
          disabled={!canAddHop(hops)}
          onClick={() =>
            onChange([
              ...hops,
              { id: `hop-${Date.now()}`, host: '', port: 22, username: '', auth: 'key' }
            ])
          }
        >
          {tg('m2.addHop')}
        </button>
        <button
          type="button"
          onClick={() => {
            void askText(tg('m2.proxyJump'), formatProxyJump(hops)).then((text) => {
              if (text == null) return
              const parsed = parseProxyJump(text)
              if (parsed.hops.length) onChange(parsed.hops)
            })
          }}
        >
          {tg('m2.pasteProxy')}
        </button>
        <button
          type="button"
          data-testid="jump-test"
          disabled={probing || !hops.length || !onTest}
          onClick={() => {
            if (!onTest) return
            setProbing(true)
            void onTest()
              .then((rows) => setProbe(rows))
              .finally(() => setProbing(false))
          }}
        >
          {probing ? tg('m2.testing') : tg('m2.testConn')}
        </button>
      </div>
      {probe ? (
        <div className="jump-probe" data-testid="jump-probe">
          {probe.map((row) => (
            <p key={row.hop} className={row.ok ? 'l4-hint' : 'jump-issue'}>
              {row.ok ? tg('m2.hopOk', { n: row.hop, ms: row.ms }) : tg('m2.hopReason', { i: row.hop, name: row.name, addr: row.addr, reason: row.reason || '' })}
            </p>
          ))}
        </div>
      ) : null}
      {issues.some((x) => x.code === 'too-many') ? <p className="jump-issue">{tg('m2.tooMany')}</p> : null}
    </div>
  )
}
