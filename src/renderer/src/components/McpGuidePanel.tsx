import { useCallback, useEffect, useMemo, useState } from 'react'
import type { McpGuideInfo } from '@shared/ipc'

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
  { name: 'list_hosts', desc: '列出主机档案' },
  { name: 'get_host', desc: '按 id 读取完整档案' },
  { name: 'search_hosts', desc: '按服务名 / 标签 / 备注搜索' },
  { name: 'upsert_host', desc: '新建或更新主机档案' },
  { name: 'upsert_service', desc: '写入主机上的服务信息' },
  { name: 'append_note', desc: '追加笔记到 notes.md' },
  { name: 'ssh_test', desc: '测试密钥登录' },
  { name: 'ssh_exec', desc: '在远端执行命令（密钥认证）' },
  { name: 'ssh_upload', desc: 'SFTP 上传本地文件' }
]

const AGENTS: AgentSection[] = [
  {
    id: 'cursor',
    title: 'Cursor',
    where: '用户级：~/.cursor/mcp.json · 或项目级：.cursor/mcp.json',
    steps: [
      '打开 Cursor Settings → MCP，或直接编辑 mcp.json',
      '粘贴下方配置（已按本机路径填好）',
      '保存后在 MCP 面板 Reload / 重启 Cursor',
      '确认出现 ai-ssh-inventory 工具列表'
    ],
    configKey: 'cursor'
  },
  {
    id: 'claude-desktop',
    title: 'Claude Desktop',
    where:
      'macOS：~/Library/Application Support/Claude/claude_desktop_config.json · Windows：%APPDATA%\\Claude\\claude_desktop_config.json',
    steps: [
      '打开配置文件，合并 mcpServers 段（不要覆盖其它服务器）',
      '完全退出并重新打开 Claude Desktop',
      '在对话里确认可调用 list_hosts 等工具'
    ],
    configKey: 'claudeDesktop'
  },
  {
    id: 'claude-code',
    title: 'Claude Code / CLI',
    where: '项目或用户 MCP 配置（claude mcp add / .mcp.json，以当前 CLI 文档为准）',
    steps: [
      '确保本机已安装 Node.js，且能执行 node <脚本路径>',
      '用 CLI 添加 stdio 服务器，或写入等价 JSON',
      '新开会话后用 /mcp 或工具列表确认已加载'
    ],
    configKey: 'claudeCode'
  },
  {
    id: 'windsurf',
    title: 'Windsurf',
    where: 'Cascade → MCP / 插件设置中的 MCP Servers',
    steps: [
      '新增 stdio MCP：command = node，args = 脚本绝对路径',
      '环境变量填 AISS_INVENTORY_ROOT（可选 AISS_SSH_KEY）',
      '保存并刷新 MCP'
    ],
    configKey: 'generic'
  },
  {
    id: 'vscode',
    title: 'VS Code（Cline / Continue 等）',
    where: '各扩展自己的 MCP / Tools 配置页',
    steps: [
      '选择 stdio 传输，启动命令为 node',
      '参数填 mcp-inventory-server.mjs 的绝对路径',
      '与 Cursor 相同的 env 字段即可共享同一份主机档案'
    ],
    configKey: 'generic'
  },
  {
    id: 'other',
    title: '其它兼容 MCP 的智能体',
    where: '凡支持 Model Context Protocol stdio 的客户端',
    steps: [
      'command: node',
      'args: [脚本绝对路径]',
      'env: AISS_INVENTORY_ROOT（及可选 AISS_SSH_KEY）',
      '与本应用「主机档案」读写同一目录，无需二次同步'
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

function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setOk(true)
      window.setTimeout(() => setOk(false), 1600)
    } catch {
      window.alert('复制失败，请手动选择文本复制')
    }
  }, [text])
  return (
    <button type="button" className="mcp-guide-copy" onClick={() => void onCopy()}>
      {ok ? '已复制' : label}
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
        <h2 className="workspace-panel-title">MCP 安装指南</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--mcp-guide">
          <p className="mcp-guide-lead">
            将本仓库的 <code>ai-ssh-inventory</code> 以 MCP（stdio）挂到 Cursor、Claude Desktop
            等智能体后，它们可直接读写与本应用相同的主机档案，并可选执行 SSH 探测 / 命令 / 上传。
          </p>

          {error ? <p className="mcp-guide-error">{error}</p> : null}

          <section className="mcp-guide-section">
            <h3>前提</h3>
            <ul>
              <li>已安装 Node.js（建议 18+），终端可运行 <code>node -v</code></li>
              <li>
                需要源码中的 <code>scripts/mcp-inventory-server.mjs</code>
                {info?.isPackaged && !info.scriptPath
                  ? '（当前为安装包运行，请先克隆仓库或从 GitHub 取得脚本）'
                  : null}
              </li>
              <li>
                主机档案目录默认 <code>~/.ai-ssh-pro/inventory</code>，可用环境变量{' '}
                <code>AISS_INVENTORY_ROOT</code> 覆盖
              </li>
            </ul>
            {info ? (
              <div className="mcp-guide-paths">
                <div className="mcp-guide-path-row">
                  <span className="mcp-guide-path-label">脚本</span>
                  <code className="mcp-guide-path-value">
                    {info.scriptPath ?? '（未找到，请手动填写克隆后的绝对路径）'}
                  </code>
                  {info.scriptPath ? <CopyButton text={info.scriptPath} /> : null}
                </div>
                <div className="mcp-guide-path-row">
                  <span className="mcp-guide-path-label">档案目录</span>
                  <code className="mcp-guide-path-value">{info.inventoryRoot}</code>
                  <CopyButton text={info.inventoryRoot} />
                </div>
                <div className="mcp-guide-path-row">
                  <span className="mcp-guide-path-label">默认密钥</span>
                  <code className="mcp-guide-path-value">{info.sshKeyPath}</code>
                  <CopyButton text={info.sshKeyPath} />
                </div>
              </div>
            ) : (
              <p className="mcp-guide-muted">正在读取本机路径…</p>
            )}
            <div className="mcp-guide-actions-row">
              <button
                type="button"
                onClick={() => {
                  void window.aiss.app.openGithub().catch((e) => {
                    window.alert(e instanceof Error ? e.message : String(e))
                  })
                }}
              >
                打开 GitHub 仓库
              </button>
              {info?.scriptPath ? (
                <CopyButton text={smokeCmd} label="复制自检命令" />
              ) : null}
            </div>
          </section>

          <section className="mcp-guide-section">
            <h3>按智能体安装</h3>
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
                <strong>配置位置：</strong>
                {active.where}
              </p>
              <ol>
                {active.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {active.configKey && configJson ? (
                <div className="mcp-guide-code-wrap">
                  <div className="mcp-guide-code-toolbar">
                    <span>通用 MCP JSON</span>
                    <CopyButton text={configJson} label="复制配置" />
                  </div>
                  <pre className="mcp-guide-code">{configJson}</pre>
                </div>
              ) : null}
            </div>
          </section>

          <section className="mcp-guide-section">
            <h3>可用工具</h3>
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
            <h3>命令行自检</h3>
            <p className="mcp-guide-muted">不启动 MCP 客户端时，可用 CLI 验证档案与脚本：</p>
            <div className="mcp-guide-code-wrap">
              <div className="mcp-guide-code-toolbar">
                <span>Shell</span>
                <CopyButton text={smokeCmd} />
              </div>
              <pre className="mcp-guide-code">{smokeCmd}</pre>
            </div>
            <p className="mcp-guide-muted">
              仓库内也可执行 <code>npm run mcp:inventory</code>（stdio 模式，供客户端拉起）。
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
