import { useCallback, useEffect, useState } from 'react'
import type { AiSettings } from '@shared/ipc'

const MASK = '••••••••'

/** 对话框内 AI 配置表单（无折叠） */
export default function AiConfigForm() {
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState(0.4)
  const [sshParseInstructions, setSshParseInstructions] = useState('')
  const [savedHint, setSavedHint] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.aiss.ai.getSettings().then((s) => {
      setBaseURL(s.baseURL)
      setModel(s.model)
      setApiKey(s.apiKey ? MASK : '')
      setTemperature(typeof s.temperature === 'number' ? s.temperature : 0.4)
      setSshParseInstructions(s.sshParseInstructions ?? '')
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async () => {
    const partial: Partial<AiSettings> = {
      baseURL: baseURL.trim() || undefined,
      model: model.trim() || undefined,
      temperature:
        typeof temperature === 'number' && Number.isFinite(temperature)
          ? Math.min(2, Math.max(0, temperature))
          : 0.4,
      sshParseInstructions: sshParseInstructions.trim()
    }
    if (apiKey && apiKey !== MASK) {
      partial.apiKey = apiKey
    }
    await window.aiss.ai.setSettings(partial)
    setSavedHint('已保存')
    setTimeout(() => setSavedHint(null), 2000)
    load()
    window.dispatchEvent(new CustomEvent('aiss-ai-settings-saved'))
  }, [apiKey, baseURL, model, sshParseInstructions, temperature, load])

  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
        API Key 仅存于本机主进程。对话与「智能填表」共用下列接口。
      </p>
      <div className="field">
        <label>Base URL</label>
        <input
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>
      <div className="field">
        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
      </div>
      <div className="field">
        <label>API Key</label>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          type="password"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label>对话温度（0–2）</label>
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="field">
        <label>SSH 智能填表 · 自定义拆分说明（可选）</label>
        <textarea
          value={sshParseInstructions}
          onChange={(e) => setSshParseInstructions(e.target.value)}
          placeholder={
            '例如：\n' +
            '• 第一行是会话显示名\n' +
            '• 「IP」「主机」后面是地址；端口单独一行写「端口: 2222」\n' +
            '• 用户名单独在「账号」后'
          }
          rows={5}
          style={{ width: '100%', resize: 'vertical', minHeight: 88 }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="primary" onClick={() => void save()}>
          保存
        </button>
        {savedHint && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{savedHint}</span>}
      </div>
    </>
  )
}
