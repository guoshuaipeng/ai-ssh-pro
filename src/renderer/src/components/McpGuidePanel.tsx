import { useCallback, useEffect, useMemo, useState } from 'react'
import type { McpGuideInfo } from '@shared/ipc'
import { tg, type MessageKey } from '../lib/i18n'
import { toast } from '../lib/dialogs'

/** Steps hold message keys (ui.*) or literal text such as "command: node". */
const stepText = (s: string): string => (s.startsWith('ui.') ? tg(s as MessageKey) : s)

type Props = {
  onClose: () => void
}

type AgentSection = {
  id: string
  title: string
  where: string
  steps: string[]
  configKey?: 'cursor' | 'claudeDesktop' | 'claudeCode' | 'generic'
}

const TOOLS = [
  { name: 'list_hosts', get desc() { return tg('ui.192') } },
  { name: 'get_host', get desc() { return tg('ui.193') } },
  { name: 'search_hosts', get desc() { return tg('ui.194') } },
  { name: 'upsert_host', get desc() { return tg('ui.195') } },
  { name: 'upsert_service', get desc() { return tg('ui.196') } },
  { name: 'append_note', get desc() { return tg('ui.197') } },
  { name: 'ssh_test', get desc() { return tg('ui.198') } },
  { name: 'ssh_exec', get desc() { return tg('ui.199') } },
  { name: 'ssh_upload', get desc() { return tg('ui.200') } }
]

const AGENTS: AgentSection[] = [
  {
    id: 'cursor',
    title: 'Cursor',
    get where() { return tg('ui.201') },
    steps: [
      'ui.202',
      'ui.203',
      'ui.204',
      'ui.205'
    ],
    configKey: 'cursor'
  },
  {
    id: 'claude-desktop',
    title: 'Claude Desktop',
    get where() { return tg('ui.206') },
    steps: [
      'ui.207',
      'ui.208',
      'ui.209'
    ],
    configKey: 'claudeDesktop'
  },
  {
    id: 'claude-code',
    title: 'Claude Code / CLI',
    get where() { return tg('ui.210') },
    steps: [
      'ui.211',
      'ui.212',
      'ui.213'
    ],
    configKey: 'claudeCode'
  },
  {
    id: 'windsurf',
    title: 'Windsurf',
    get where() { return tg('ui.214') },
    steps: [
      'ui.215',
      'ui.216',
      'ui.217'
    ],
    configKey: 'generic'
  },
  {
    id: 'vscode',
    get title() { return tg('ui.218') },
    get where() { return tg('ui.219') },
    steps: [
      'ui.220',
      'ui.221',
      'ui.222'
    ],
    configKey: 'generic'
  },
  {
    id: 'other',
    get title() { return tg('ui.223') },
    get where() { return tg('ui.224') },
    steps: [
      'command: node',
      'ui.225',
      'ui.226',
      'ui.227'
    ],
    configKey: 'generic'
  }
]

function buildMcpJson(info: McpGuideInfo, scriptFallback: string): string {
  const script = info.scriptPathJson || scriptFallback
  const block = {
    mcpServers: {
      'ai-ssh-inventory': {
        command: 'node',
        args: [script],
        env: {
          AISS_INVENTORY_ROOT: info.inventoryRootJson,
          ...(info.sshKeyPath
            ? { AISS_SSH_KEY: info.sshKeyPath.replace(/\\/g, '/') }
            : {})
        }
      }
    }
  }
  return JSON.stringify(block, null, 2)
}

function CopyButton({ text, label = tg('ui.228') }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setOk(true)
      window.setTimeout(() => setOk(false), 1600)
    } catch {
      toast({ text: tg('ui.229'), kind: 'error' })
    }
  }, [text])
  return (
    <button type="button" className="mcp-guide-copy" onClick={() => void onCopy()}>
      {ok ? tg('ui.230') : label}
    </button>
  )
}

export default function McpGuidePanel({ onClose }: Props) {
  const [info, setInfo] = useState<McpGuideInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState(AGENTS[0].id)

  useEffect(() => {
    let cancelled = false
    void window.aiss.app
      .getMcpGuideInfo()
      .then((v) => {
        if (!cancelled) setInfo(v)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scriptFallback = '/absolute/path/to/ai-ssh-pro/scripts/mcp-inventory-server.mjs'
  const configJson = useMemo(
    () => (info ? buildMcpJson(info, scriptFallback) : ''),
    [info]
  )

  const active = AGENTS.find((a) => a.id === activeId) ?? AGENTS[0]

  const smokeCmd = info?.scriptPath
    ? `node "${info.scriptPath}" --list`
    : 'node scripts/mcp-inventory-server.mjs --list'

  return (
    <div className="workspace-panel workspace-panel--settings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('ui.231')}</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose}>
            {tg('ui.27')}
          </button>
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--mcp-guide">
          <p className="mcp-guide-lead">
            {tg('ui.232')}{' '} <code>ai-ssh-inventory</code> {' '}{tg('ui.233')}
          </p>

          {error ? <p className="mcp-guide-error">{error}</p> : null}

          <section className="mcp-guide-section">
            <h3>{tg('ui.234')}</h3>
            <ul>
              <li>{tg('ui.235')}{' '} <code>node -v</code></li>
              <li>
                {tg('ui.236')}{' '} <code>scripts/mcp-inventory-server.mjs</code>
                {info?.isPackaged && !info.scriptPath
                  ? tg('ui.237')
                  : null}
              </li>
              <li>
                {tg('ui.238')}{' '} <code>~/.ai-ssh-pro/inventory</code>{tg('ui.239')}{' '}
                <code>AISS_INVENTORY_ROOT</code> {' '}{tg('ui.240')}
              </li>
            </ul>
            {info ? (
              <div className="mcp-guide-paths">
                <div className="mcp-guide-path-row">
                  <span className="mcp-guide-path-label">{tg('ui.241')}</span>
                  <code className="mcp-guide-path-value">
                    {info.scriptPath ?? tg('ui.242')}
                  </code>
                  {info.scriptPath ? <CopyButton text={info.scriptPath} /> : null}
                </div>
                <div className="mcp-guide-path-row">
                  <span className="mcp-guide-path-label">{tg('ui.243')}</span>
                  <code className="mcp-guide-path-value">{info.inventoryRoot}</code>
                  <CopyButton text={info.inventoryRoot} />
                </div>
                <div className="mcp-guide-path-row">
                  <span className="mcp-guide-path-label">{tg('ui.244')}</span>
                  <code className="mcp-guide-path-value">{info.sshKeyPath}</code>
                  <CopyButton text={info.sshKeyPath} />
                </div>
              </div>
            ) : (
              <p className="mcp-guide-muted">{tg('ui.245')}</p>
            )}
            <div className="mcp-guide-actions-row">
              <button
                type="button"
                onClick={() => {
                  void window.aiss.app.openGithub().catch((e) => {
                    toast({ text: e instanceof Error ? e.message : String(e), kind: 'error' })
                  })
                }}
              >
                {tg('ui.246')}
              </button>
              {info?.scriptPath ? (
                <CopyButton text={smokeCmd} label={tg('ui.247')} />
              ) : null}
            </div>
          </section>

          <section className="mcp-guide-section">
            <h3>{tg('ui.248')}</h3>
            <div className="mcp-guide-agent-tabs" role="tablist">
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={a.id === activeId}
                  className={`mcp-guide-agent-tab${a.id === activeId ? ' is-active' : ''}`}
                  onClick={() => setActiveId(a.id)}
                >
                  {a.title}
                </button>
              ))}
            </div>
            <div className="mcp-guide-agent-body" role="tabpanel">
              <p className="mcp-guide-where">
                <strong>{tg('ui.249')}</strong>
                {active.where}
              </p>
              <ol>
                {active.steps.map((s) => (
                  <li key={s}>{stepText(s)}</li>
                ))}
              </ol>
              {active.configKey && configJson ? (
                <div className="mcp-guide-code-wrap">
                  <div className="mcp-guide-code-toolbar">
                    <span>{tg('ui.250')}</span>
                    <CopyButton text={configJson} label={tg('ui.251')} />
                  </div>
                  <pre className="mcp-guide-code">{configJson}</pre>
                </div>
              ) : null}
            </div>
          </section>

          <section className="mcp-guide-section">
            <h3>{tg('ui.252')}</h3>
            <ul className="mcp-guide-tools">
              {TOOLS.map((t) => (
                <li key={t.name}>
                  <code>{t.name}</code>
                  <span>{t.desc}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mcp-guide-section">
            <h3>{tg('ui.253')}</h3>
            <p className="mcp-guide-muted">{tg('ui.254')}</p>
            <div className="mcp-guide-code-wrap">
              <div className="mcp-guide-code-toolbar">
                <span>Shell</span>
                <CopyButton text={smokeCmd} />
              </div>
              <pre className="mcp-guide-code">{smokeCmd}</pre>
            </div>
            <p className="mcp-guide-muted">
              {tg('ui.255')}{' '} <code>npm run mcp:inventory</code>{tg('ui.256')}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
