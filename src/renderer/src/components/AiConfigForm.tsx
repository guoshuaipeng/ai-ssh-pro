import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiProvider, AiSettings } from '@shared/ipc'
import { tg, useI18n } from '../lib/i18n'

const MASK = '••••••••'

function parseModelLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return [...new Set(lines)]
}

/** 对话框内 AI 配置表单（无折叠） */
export default function AiConfigForm() {
  const { locale } = useI18n()
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
  const [useOpenClaw, setUseOpenClaw] = useState(true)
  const [savedHint, setSavedHint] = useState<string | null>(null)
  const [testHint, setTestHint] = useState<string | null>(null)
  const [testOk, setTestOk] = useState(false)
  const [testBusy, setTestBusy] = useState(false)

  const parsedModelList = useMemo(() => parseModelLines(modelListText), [modelListText])

  const load = useCallback(() => {
    void window.aiss.ai.getSettings().then((s) => {
      setProviders(s.providers)
      setActiveProviderId(s.activeProviderId)
      setTemperature(typeof s.temperature === 'number' ? s.temperature : 0.1)
      setSshParseInstructions(s.sshParseInstructions ?? '')
      setUseOpenClaw(s.useOpenClaw !== false)

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
      name: tg('ui.2'),
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


  const testConnection = useCallback(async () => {
    if (testBusy) return
    setTestBusy(true)
    setTestHint(null)
    setTestOk(false)
    try {
      const key = apiKey === MASK ? storedApiKey : apiKey.trim()
      // Prefer live editor values so users can verify before Save.
      const res = await window.aiss.ai.testProvider({
        baseURL: baseURL.trim(),
        apiKey: key,
        model: model.trim() || parseModelLines(modelListText)[0] || ''
      })
      const en = locale === 'en'
      if (res.ok) {
        setTestOk(true)
        setTestHint(tg('ai.testOk', { ms: String(res.latencyMs), model: res.model }))
      } else {
        setTestHint(en ? res.messageEn : res.messageZh)
      }
    } catch (e) {
      setTestHint(e instanceof Error ? e.message : String(e))
    } finally {
      setTestBusy(false)
      window.setTimeout(() => setTestHint(null), 8000)
    }
  }, [apiKey, baseURL, locale, model, modelListText, storedApiKey, testBusy])

  const save = useCallback(async () => {
    if (!baseURL.trim()) {
      setSavedHint(tg('ui.3'))
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
      sshParseInstructions: sshParseInstructions.trim(),
      useOpenClaw,
      autoApproveLowRisk: false
    }

    await window.aiss.ai.setSettings(partial)
    setSavedHint(tg('ui.4'))
    setTimeout(() => setSavedHint(null), 2000)
    load()
    window.dispatchEvent(new CustomEvent('aiss-ai-settings-saved'))
  }, [activeProviderId, baseURL, commitEditorToProviders, load, model, modelListText, sshParseInstructions, temperature, useOpenClaw])

  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
        {tg('ui.5')}
      </p>

      {providers.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0, flex: '1 1 280px' }}>
            <label>{tg('ui.6')}</label>
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
              {tg('ui.7')}
            </button>
            <button type="button" onClick={() => removeActiveProvider()} disabled={providers.length <= 1}>
              {tg('ui.8')}
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label>{tg('ui.9')}</label>
        <input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="ChatGPT / DeepSeek / Qwen" />
      </div>

      <div className="field">
        <label>Base URL</label>
        <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
      </div>

      <div className="field">
        <label>{tg('ui.10')}</label>
        <textarea
          value={modelListText}
          onChange={(e) => setModelListText(e.target.value)}
          placeholder={'qwen-max\nqwen-turbo\nqwen-plus'}
          rows={5}
          style={{ width: '100%', resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
        />
      </div>

      <div className="field">
        <label>{tg('ui.11')}</label>
        <select
          value={parsedModelList.includes(model) ? model : parsedModelList[0] ?? ''}
          onChange={(e) => setModel(e.target.value)}
          disabled={parsedModelList.length === 0}
          style={{ width: '100%' }}
        >
          {parsedModelList.length === 0 ? <option value="">{tg('ui.12')}</option> : null}
          {parsedModelList.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
          {tg('ui.13')}
        </p>
      </div>

      <div className="field">
        <label>API Key</label>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={tg('ui.14')}
          type="password"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label>{tg('ui.15')}</label>
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={useOpenClaw}
            onChange={(e) => setUseOpenClaw(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            {tg('ui.16')}
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 4 }}>
              {tg('ui.17')}
            </span>
          </span>
        </label>
      </div>
      <div className="field">
        <label>{tg('ui.20')}</label>
        <textarea
          value={sshParseInstructions}
          onChange={(e) => setSshParseInstructions(e.target.value)}
          placeholder={
            tg('ui.21') +
            tg('ui.22') +
            tg('ui.23') +
            tg('ui.24')
          }
          rows={5}
          style={{ width: '100%', resize: 'vertical', minHeight: 88 }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="primary" onClick={() => void save()}>
          {tg('ui.25')}
        </button>
        <button
          type="button"
          data-testid="ai-provider-test"
          disabled={testBusy}
          title={tg('ai.testTip')}
          onClick={() => void testConnection()}
        >
          {testBusy ? tg('ai.testing') : tg('ai.testConnection')}
        </button>
        {savedHint && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{savedHint}</span>}
        {testHint && (
          <span
            data-testid="ai-provider-test-hint"
            style={{ fontSize: 12, color: testOk ? 'var(--accent)' : 'var(--danger)' }}
          >
            {testHint}
          </span>
        )}
      </div>
    </>
  )
}
