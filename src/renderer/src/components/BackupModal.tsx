import { useState } from 'react'
import { useI18n, type MessageKey } from '../lib/i18n'
import { askConfirm } from '../lib/dialogs'
import Modal from './Modal'

type Props = { open: boolean; onClose: () => void }

const MIN = 8

/** Password-encrypted export / import of sessions, snippets, terminal prefs and (optionally) AI settings. */
export default function BackupModal({ open, onClose }: Props) {
  const { t } = useI18n()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [includeAi, setIncludeAi] = useState(true)
  const [importPw, setImportPw] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const errText = (code: string) => {
    const k = `bk.err.${code}` as MessageKey
    const s = t(k)
    return s === k ? code : s
  }

  const doExport = async () => {
    setMsg(null)
    if (pw.length < MIN) return setMsg({ ok: false, text: t('bk.tooShort', { n: MIN }) })
    if (pw !== pw2) return setMsg({ ok: false, text: t('bk.mismatch') })
    setBusy(true)
    try {
      const r = await window.aiss.backup.export({ password: pw, includeAi })
      if (r.ok) {
        setMsg({ ok: true, text: t('bk.exported', { profiles: r.counts.profiles, snippets: r.counts.snippets, path: r.path }) })
        setPw('')
        setPw2('')
      } else if (!r.canceled) setMsg({ ok: false, text: errText(r.error) })
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    setMsg(null)
    if (!importPw) return setMsg({ ok: false, text: t('bk.needPassword') })
    if (!(await askConfirm(t('bk.importTitle'), t('bk.importConfirm'), { danger: true, okLabel: t('bk.importOk') }))) return
    setBusy(true)
    try {
      const r = await window.aiss.backup.import({ password: importPw })
      if (r.ok) {
        setMsg({ ok: true, text: t('bk.imported', { profiles: r.counts.profiles, snippets: r.counts.snippets }) })
        setTimeout(() => window.location.reload(), 900)
      } else if (!r.canceled) setMsg({ ok: false, text: errText(r.error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={t('bk.title')} onClose={onClose} width={560}>
      <div className="bk-panel">
        <p className="bk-hint">{t('bk.hint')}</p>
        <section className="bk-section">
          <h4>{t('bk.export')}</h4>
          <label>
            {t('bk.password')}
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </label>
          <label>
            {t('bk.confirm')}
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="bk-check">
            <input type="checkbox" checked={includeAi} onChange={(e) => setIncludeAi(e.target.checked)} /> {t('bk.includeAi')}
          </label>
          <button type="button" className="primary" disabled={busy} onClick={() => void doExport()}>
            {t('bk.exportBtn')}
          </button>
        </section>
        <section className="bk-section">
          <h4>{t('bk.import')}</h4>
          <label>
            {t('bk.importPassword')}
            <input type="password" value={importPw} onChange={(e) => setImportPw(e.target.value)} autoComplete="off" />
          </label>
          <button type="button" disabled={busy} onClick={() => void doImport()}>
            {t('bk.importBtn')}
          </button>
        </section>
        {msg ? <p className={msg.ok ? 'bk-ok' : 'bk-error'}>{msg.text}</p> : null}
      </div>
    </Modal>
  )
}
