import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiProvider, AiSettings } from '@shared/ipc'

const MASK = '••••••••'

function parseModelLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return [...new Set(lines)]
}

/** 对话框内 AI 配置表单（无折叠） */
export default function AiConfigForm() {
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [activeProviderId, setActiveProviderId] = useState('')

  // 当前 Provider 编辑字段（不会自动写入 store，点击保存才会落盘）
  const [providerName, setProviderName] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [modelListText, setModelListText] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [storedApiKey, setStoredApiKey] = useState('')

  const [temperature, setTemperature] = useState(0.1)
  const [sshParseInstructions, setSshParseInstructions] = useState('')
  const [savedHint, setSavedHint] = useState<string | null>(null)

  const parsedModelList = useMemo(() => parseModelLines(modelListText), [modelListText])

  const load = useCallback(() => {
    void window.aiss.ai.getSettings().then((s) => {
      setProviders(s.providers)
      setActiveProviderId(s.activeProviderId)
      setTemperature(typeof s.temperature === 'number' ? s.temperature : 0.1)
      setSshParseInstructions(s.sshParseInstructions ?? '')

      const p = s.providers.find((x) => x.id === s.activeProviderId) ?? s.providers[0]
      if (p) {
        setProviderName(p.name)
        setBaseURL(p.baseURL)
        setModelListText((p.modelList && p.modelList.length > 0 ? p.modelList : [s.model]).join('\n'))
        setStoredApiKey(p.apiKey)
        setApiKey(p.apiKey ? MASK : '')
      } else {
        setProviderName('')
        setBaseURL('')
        setModelListText('')
        setStoredApiKey('')
        setApiKey('')
      }

      setModel(s.model)
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const commitEditorToProviders = useCallback((): AiProvider[] => {
    const finalList = (() => {
      const list = parseModelLines(modelListText)
      return list.length > 0 ? list : [model.trim() || 'qwen-max']
    })()
    const nextApiKey = apiKey === MASK ? storedApiKey : apiKey.trim()

    return providers.map((p) => {
      if (p.id !== activeProviderId) return p
      return {
        ...p,
        name: providerName.trim() || p.name,
        baseURL: baseURL.trim() || p.baseURL,
        apiKey: nextApiKey,
        modelList: finalList
      }
    })
  }, [apiKey, baseURL, activeProviderId, model, modelListText, providerName, providers, storedApiKey])

  useEffect(() => {
    if (parsedModelList.length === 0) return
    if (!parsedModelList.includes(model)) {
      setModel(parsedModelList[0]!)
    }
  }, [parsedModelList, model])

  const selectProvider = useCallback(
    (pid: string) => {
      const nextProviders = commitEditorToProviders()
      const p = nextProviders.find((x) => x.id === pid)
      if (!p) return

      setProviders(nextProviders)
      setActiveProviderId(pid)
      setProviderName(p.name)
      setBaseURL(p.baseURL)
      setModelListText(p.modelList.join('\n'))
      setStoredApiKey(p.apiKey)
      setApiKey(p.apiKey ? MASK : '')
      setModel((cur) => (p.modelList.includes(cur) ? cur : p.modelList[0] ?? cur))
    },
    [commitEditorToProviders]
  )

  const addProvider = useCallback(() => {
    const nextProviders = commitEditorToProviders()
    const id = `provider_${Date.now()}`
    const p: AiProvider = {
      id,
      name: '新 Provider',
      baseURL: '',
      apiKey: '',
      modelList: ['qwen-max']
    }
    const merged = [...nextProviders, p]
    setProviders(merged)
    setActiveProviderId(id)
    setProviderName(p.name)
    setBaseURL(p.baseURL)
    setModelListText(p.modelList.join('\n'))
    setStoredApiKey('')
    setApiKey('')
    setModel(p.modelList[0] ?? '')
  }, [commitEditorToProviders])

  const removeActiveProvider = useCallback(() => {
    if (providers.length <= 1) return
    const nextProviders = commitEditorToProviders().filter((p) => p.id !== activeProviderId)
    const nextActive = nextProviders[0]!
    setProviders(nextProviders)
    setActiveProviderId(nextActive.id)
    setProviderName(nextActive.name)
    setBaseURL(nextActive.baseURL)
    setModelListText(nextActive.modelList.join('\n'))
    setStoredApiKey(nextActive.apiKey)
    setApiKey(nextActive.apiKey ? MASK : '')
    setModel(nextActive.modelList[0] ?? model)
  }, [activeProviderId, commitEditorToProviders, model, providers])

  const save = useCallback(async () => {
    if (!baseURL.trim()) {
      setSavedHint('Base URL 不能为空')
      setTimeout(() => setSavedHint(null), 2000)
      return
    }

    const list = parseModelLines(modelListText)
    const finalList = list.length > 0 ? list : [model.trim() || 'qwen-max']
    let active = model.trim()
    if (!finalList.includes(active)) active = finalList[0]!

    const nextProviders = commitEditorToProviders().map((p) => {
      // 只保证当前编辑项已写入 finalList/modelListText（commit 已做，但这里补一次防御）
      if (p.id !== activeProviderId) return p
      return { ...p, modelList: finalList }
    })

    const partial: Partial<AiSettings> = {
      providers: nextProviders,
      activeProviderId,
      model: active,
      temperature:
        typeof temperature === 'number' && Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0.1,
      sshParseInstructions: sshParseInstructions.trim()
    }

    await window.aiss.ai.setSettings(partial)
    setSavedHint('已保存')
    setTimeout(() => setSavedHint(null), 2000)
    load()
    window.dispatchEvent(new CustomEvent('aiss-ai-settings-saved'))
  }, [activeProviderId, baseURL, commitEditorToProviders, load, model, modelListText, sshParseInstructions, temperature])

  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
        支持创建多个 Provider（例如 ChatGPT / DeepSeek / Qwen）。API Key 仅存于本机主进程，需自行在各平台创建。
      </p>

      {providers.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0, flex: '1 1 280px' }}>
            <label>当前 Provider</label>
            <select
              value={providers.some((p) => p.id === activeProviderId) ? activeProviderId : providers[0]!.id}
              onChange={(e) => selectProvider(e.target.value)}
              style={{ width: '100%' }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => addProvider()}>
              添加 Provider
            </button>
            <button type="button" onClick={() => removeActiveProvider()} disabled={providers.length <= 1}>
              删除
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label>Provider 名称（界面展示）</label>
        <input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="ChatGPT / DeepSeek / Qwen" />
      </div>

      <div className="field">
        <label>Base URL</label>
        <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
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
          placeholder="不填则使用当前已保存值（或清空）"
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
