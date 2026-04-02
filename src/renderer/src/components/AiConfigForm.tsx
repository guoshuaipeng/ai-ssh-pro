import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiSettings } from '@shared/ipc'

const MASK = '••••••••'

function parseModelLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return [...new Set(lines)]
}

/** 对话框内 AI 配置表单（无折叠） */
export default function AiConfigForm() {
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [modelListText, setModelListText] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState(0.1)
  const [sshParseInstructions, setSshParseInstructions] = useState('')
  const [savedHint, setSavedHint] = useState<string | null>(null)

  const parsedModelList = useMemo(() => parseModelLines(modelListText), [modelListText])

  const load = useCallback(() => {
    void window.aiss.ai.getSettings().then((s) => {
      setBaseURL(s.baseURL)
      setModel(s.model)
      setModelListText((s.modelList && s.modelList.length > 0 ? s.modelList : [s.model]).join('\n'))
      setApiKey(s.apiKey ? MASK : '')
      setTemperature(typeof s.temperature === 'number' ? s.temperature : 0.1)
      setSshParseInstructions(s.sshParseInstructions ?? '')
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (parsedModelList.length === 0) return
    if (!parsedModelList.includes(model)) {
      setModel(parsedModelList[0]!)
    }
  }, [parsedModelList, model])

  const save = useCallback(async () => {
    const list = parseModelLines(modelListText)
    const finalList = list.length > 0 ? list : [model.trim() || 'qwen-max']
    let active = model.trim()
    if (!finalList.includes(active)) {
      active = finalList[0]!
    }
    const partial: Partial<AiSettings> = {
      baseURL: baseURL.trim() || undefined,
      model: active,
      modelList: finalList,
      temperature:
        typeof temperature === 'number' && Number.isFinite(temperature)
          ? Math.min(2, Math.max(0, temperature))
          : 0.1,
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
  }, [apiKey, baseURL, model, modelListText, sshParseInstructions, temperature, load])

  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
        默认对接阿里云 DashScope 兼容 OpenAI 接口；API Key 仅存于本机主进程，需自行在控制台创建。
      </p>
      <div className="field">
        <label>Base URL</label>
        <input
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
        />
      </div>

      <div className="field">
        <label>模型列表（每行一个模型 ID）</label>
        <textarea
          value={modelListText}
          onChange={(e) => setModelListText(e.target.value)}
          placeholder={'qwen-max\nqwen-turbo\nqwen-plus'}
          rows={5}
          style={{ width: '100%', resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
        />
      </div>
      <div className="field">
        <label>当前使用的模型</label>
        <select
          value={parsedModelList.includes(model) ? model : parsedModelList[0] ?? ''}
          onChange={(e) => setModel(e.target.value)}
          disabled={parsedModelList.length === 0}
          style={{ width: '100%' }}
        >
          {parsedModelList.length === 0 ? <option value="">请先填写上方列表</option> : null}
          {parsedModelList.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
          侧栏「AI 助手」顶部也可快速切换，无需打开本窗口。
        </p>
      </div>

      <div className="field">
        <label>API Key</label>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="DashScope API-Key（自行填写）"
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
