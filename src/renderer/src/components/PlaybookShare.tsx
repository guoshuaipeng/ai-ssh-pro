import { useMemo, useState } from 'react'
import {
  applyShareImport,
  buildSharePlain,
  decodeSharePack,
  defaultShareName,
  encodeSharePack,
  previewShareImport,
  type ShareConflict,
  type SharePlain,
  type SharePlaybook
} from '@shared/playbook-share'
import { loadPlaybooks, savePlaybooks, type Playbook } from '@shared/playbook'
import { tg } from '../lib/i18n'
import { showToast } from '../lib/toast'
import Modal from './Modal'

let staged: { name: string; raw: string } | null = null

export function stageShareImport(file: { name: string; raw: string }): void {
  staged = file
}

export function takeShareImport(): { name: string; raw: string } | null {
  return staged
}

function errorKey(code: string): 'w5.badPass' | 'w5.badFormat' | 'w5.needNewer' {
  if (code === 'bad-pass') return 'w5.badPass'
  if (code === 'need-newer') return 'w5.needNewer'
  return 'w5.badFormat'
}

export function ShareExportModal({
  open,
  playbooks,
  hosts,
  appVersion,
  onClose
}: {
  open: boolean
  playbooks: Playbook[]
  hosts: Array<{ title: string; tags?: string[] }>
  appVersion: string
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string[]>(() => playbooks.filter((p) => !p.draft).map((p) => p.id))
  const [usePass, setUsePass] = useState(true)
  const [noPass, setNoPass] = useState(false)
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const selected = playbooks.filter((p) => picked.includes(p.id))
  const mismatch = usePass && !noPass && pass !== confirm
  const disabled = selected.length === 0 || (usePass && !noPass && (pass.length < 4 || mismatch))
  const save = async () => {
    const hints = hosts.map((h) => ({ title: h.title, tags: h.tags }))
    const plain = buildSharePlain(selected, hints, appVersion || '0.4.12')
    const body = await encodeSharePack(plain, noPass || !usePass ? '' : pass)
    const file = await window.aiss.files.saveText(defaultShareName(), body)
    if (!file) return
    showToast(tg('w5.toastExported'), {
      action: {
        label: tg('w4.openFolder'),
        run: () => void window.aiss.files.reveal?.(file)
      }
    })
    onClose()
  }
  return (
    <Modal open={open} title={tg('w5.modalTitle')} onClose={onClose} width={520} testId="w5-export">
      <div className="w5-export">
        <p>{tg('w5.willExport', { n: selected.length })}</p>
        <div className="w5-list">
          {playbooks.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={picked.includes(p.id)}
                onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)))}
              />
              <span>{p.name}</span>
              {p.draft ? <span className="w1-draft">{tg('w1.draft')}</span> : null}
            </label>
          ))}
        </div>
        <label className="l4-check">
          <input type="checkbox" checked={usePass && !noPass} onChange={(e) => { setUsePass(e.target.checked); if (e.target.checked) setNoPass(false) }} />
          {tg('w5.setPass')}
        </label>
        {usePass && !noPass ? (
          <div className="w5-pass">
            <input type="password" value={pass} aria-label={tg('w5.setPass')} onChange={(e) => setPass(e.target.value)} />
            <input type="password" value={confirm} aria-label={tg('w5.confirmPass')} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch ? <span className="l2-error">{tg('w5.passMismatch')}</span> : null}
          </div>
        ) : null}
        <p className="l7-muted">{tg('w5.noSecrets')}</p>
        <label className="l4-check">
          <input type="checkbox" checked={noPass} onChange={(e) => { setNoPass(e.target.checked); if (e.target.checked) setUsePass(false) }} />
          {tg('w5.noPass')}
        </label>
        {noPass ? <p className="w5-warn" data-testid="w5-nopass">{tg('w5.noPassWarn')}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>{tg('dlg.cancel')}</button>
          <button type="button" className="primary" disabled={disabled} onClick={() => void save()}>
            {selected.length ? tg('w5.exportBtn') : tg('w5.pickFirst')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function PlaybookImportTab({ appVersion: _version, onClose }: { appVersion?: string; onClose: () => void }) {
  const initial = takeShareImport()
  const [name, setName] = useState(initial?.name ?? '')
  const [raw, setRaw] = useState(initial?.raw ?? '')
  const [pass, setPass] = useState('')
  const [plain, setPlain] = useState<SharePlain | null>(null)
  const [encrypted, setEncrypted] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [policy, setPolicy] = useState<ShareConflict>('skip')
  const suffix = tg('w5.suffix')
  const existing = loadPlaybooks()
  const rows = useMemo(() => (plain ? previewShareImport(existing, plain.playbooks, policy, suffix) : []), [plain, existing, policy, suffix])
  const writable = rows.filter((r) => r.status !== 'skip').length

  const unlock = async (text = raw, phrase = pass) => {
    setError('')
    try {
      const decoded = await decodeSharePack(text, phrase)
      setPlain(decoded.plain)
      setEncrypted(decoded.encrypted)
    } catch (err) {
      setPlain(null)
      setError(tg(errorKey((err as { code?: string }).code || 'bad-format')))
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    setName(file.name)
    setRaw(text)
    stageShareImport({ name: file.name, raw: text })
    const peek = text.includes('"encrypted":true') || text.includes('"encrypted": true')
    if (!peek) void unlock(text, '')
    else setPlain(null)
  }

  const apply = () => {
    if (!plain) return
    const result = applyShareImport(loadPlaybooks(), plain.playbooks, policy, suffix)
    savePlaybooks(result.list)
    window.dispatchEvent(new Event('aiss-playbooks'))
    showToast(result.written ? tg('w5.toastImported', { n: result.written }) : tg('w5.toastAllSkipped'))
    onClose()
  }

  return (
    <div className="workspace-panel" data-testid="playbook-import">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('w5.importTitle', { name: name || tg('w5.import') })}</h2>
        <div className="workspace-panel-actions">
          <button type="button" className="primary" disabled={!plain || writable === 0} onClick={apply}>
            {tg('w5.importBtn', { n: writable })}
          </button>
          <button type="button" onClick={onClose}>{tg('common.close')}</button>
        </div>
      </div>
      <div className="workspace-panel-body w5-import">
        <label className="l2c-enable">
          {tg('w5.chooseFile')}
          <input
            type="file"
            accept=".aiss-playbooks,application/json"
            data-testid="w5-file"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        {encrypted !== false ? (
          <div className="w5-pass">
            <input type="password" value={pass} aria-label={tg('w5.setPass')} onChange={(e) => setPass(e.target.value)} />
            <button type="button" onClick={() => void unlock()}>{tg('w5.unlock')}</button>
          </div>
        ) : (
          <p className="w5-warn">{tg('w5.unencrypted')}</p>
        )}
        {error ? (
          <p className="l2-error" data-testid="w5-error">
            {error}
            <button type="button" onClick={() => void unlock()}>{tg('upd.retry')}</button>
          </p>
        ) : null}
        {plain ? (
          <>
            <div className="l2c-scope" role="radiogroup" aria-label={tg('w5.conflict')}>
              {(['skip', 'overwrite', 'duplicate'] as const).map((key) => (
                <label key={key}>
                  <input type="radio" name="w5-policy" checked={policy === key} onChange={() => setPolicy(key)} />
                  {tg(key === 'skip' ? 'w5.skip' : key === 'overwrite' ? 'w5.overwrite' : 'w5.dup')}
                </label>
              ))}
            </div>
            <table className="s2b-table">
              <thead>
                <tr>
                  <th>{tg('w5.colName')}</th>
                  <th>{tg('w5.colStatus')}</th>
                  <th>{tg('w5.colSteps')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.nextName}</td>
                    <td>{tg(row.status === 'import' ? 'w5.willImport' : row.status === 'skip' ? 'w5.willSkip' : row.status === 'overwrite' ? 'w5.willOverwrite' : 'w5.willDup')}</td>
                    <td>{row.steps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="l7-muted">
              {tg('w5.hostHints', { list: plain.hostHints.map((h) => h.title).filter(Boolean).join(', ') || '—' })}
            </p>
            <p className="w5-warn">{tg('w5.reviewWarn')}</p>
          </>
        ) : null}
      </div>
    </div>
  )
}

export type { SharePlaybook }
