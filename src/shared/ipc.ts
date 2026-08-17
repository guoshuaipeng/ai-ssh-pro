/** 主菜单 / 工具栏打开的对话框或会话管理命令 */
export type AppDialogKind =
  | 'connection'
  | 'ai'
  | 'debug'
  | 'terminalPrefs'
  | 'uiTheme'
  | 'snippets'
  | 'inventory'
  | 'newFolder'
  | 'importSessions'
  | 'exportJson'
  | 'exportOpenssh'
  | 'toggleSidebar'
  | 'toggleMain'
  | 'toggleAi'
  | 'localShell'
  | 'sftp'
  | 'refreshDocker'
  | 'toggleSplit'
  | 'toggleBroadcast'
  | 'toggleRecording'

/** 跳板机认证（与目标主机字段同形，不含再嵌套 jump） */
export type SshJumpHostOptions = {
  host: string
  port?: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

export type LocalPortForward = {
  localPort: number
  remoteHost: string
  remotePort: number
}

export type SessionMeta = {
  host: string
  port: number
  username: string
  label?: string
  connectedAt: number
  termCols: number
  termRows: number
  /** 本地 Shell 标签 */
  kind?: 'ssh' | 'local'
}

export type SshConnectOptions = {
  host: string
  port?: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  label?: string
  termCols?: number
  termRows?: number
  /** ProxyJump / bastion */
  jumpHost?: SshJumpHostOptions
  /** 本地端口转发（连接成功后建立） */
  forwards?: LocalPortForward[]
}

export type SshConnectResult = {
  sessionId: string
  meta: SessionMeta
}

export type SshDataEvent = {
  sessionId: string
  /**
   * SSH 会话可能为二进制（Zmodem）；本机 shell 一般为 UTF-8 字符串。
   * Electron IPC 会把 Buffer 编成 Uint8Array。
   */
  chunk: string | Uint8Array
}

export type SftpProgressEvent = {
  transferId: string
  sessionId: string
  direction: 'upload' | 'download'
  name: string
  transferred: number
  total: number
  done?: boolean
  error?: string
}

export type SshStatusEvent = {
  sessionId: string
  status: 'connected' | 'error' | 'closed'
  message?: string
}

/** 首次连接或主机密钥变更时，主进程推送给渲染进程的确认请求 */
export type SshHostKeyPromptEvent = {
  requestId: string
  host: string
  port: number
  fingerprint: string
  reason: 'unknown' | 'changed'
  previousFingerprint?: string
}

export type SshHostKeyRespondPayload = {
  requestId: string
  /** 是否接受本次连接 */
  accept: boolean
  /** 接受时是否永久信任并写入 known_hosts */
  alwaysTrust?: boolean
}

export type SshSnapshotOptions = {
  /** 读取最近终端输出行数 */
  maxLines?: number
  /** 从“当前命令”开始读取（命令本身 + 其后输出） */
  fromCurrentCommand?: boolean
  /** fromCurrentCommand=true 时，是否包含命令行文本（默认 true） */
  includeCommandLine?: boolean
}

export type DockerContainer = {
  id: string
  name: string
  image: string
  state: string
  status: string
  shortStatus: string
  ports: string
  createdAt?: string
  /** com.docker.compose.project */
  composeProject?: string
  /** com.docker.compose.service */
  composeService?: string
  /** com.docker.swarm.service.name — Swarm 任务容器 */
  swarmService?: string
}

export type DockerComposeProject = {
  name: string
  status?: string
  configFiles?: string
  /** 属于该 compose 项目的容器 */
  containers: DockerContainer[]
}

export type DockerComposeService = {
  name: string
  id?: string
  state: string
  status: string
  shortStatus: string
}

export type DockerTreeResult = {
  /** 不属于任何 compose 项目的独立容器 */
  containers: DockerContainer[]
  composeProjects: DockerComposeProject[]
  containersError?: string
  composeError?: string
}

export type DockerContainerAction = 'start' | 'stop' | 'restart' | 'rm'
export type DockerComposeAction = 'up' | 'down'

export type SftpListEntry = {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifyTime?: number
}

export type SftpListResult = {
  path: string
  entries: SftpListEntry[]
}

export type SftpReadTextResult = {
  path: string
  content: string
  size: number
  truncated: boolean
  encoding: 'utf-8'
}

export type SavedSessionFolder = {
  id: string
  name: string
}

export type SavedSessionProfile = {
  id: string
  label: string
  host: string
  port: number
  username: string
  /** 与连接表单一致；保存会话时写入，侧栏一键连接时使用 */
  password?: string
  privateKeyPath?: string
  passphrase?: string
  /** 所属分组 id；缺省表示未分组（根目录） */
  folderId?: string
  jumpHost?: SshJumpHostOptions
  forwards?: LocalPortForward[]
  /** 关联主机知识库档案 id */
  hostInventoryId?: string
}

/** 侧栏已保存会话与分组（持久化） */
export type SavedSessionsState = {
  folders: SavedSessionFolder[]
  profiles: SavedSessionProfile[]
}

/** 从外部文件解析出的草稿（无 id，导入时由 UI 分配） */
export type ImportedSessionDraft = {
  label: string
  host: string
  port: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  jumpHost?: SshJumpHostOptions
  forwards?: LocalPortForward[]
}

export type SessionImportPickResult = {
  items: ImportedSessionDraft[]
  /** 人类可读提示，如跳过原因 */
  notes: string[]
}

export type SessionExportFormat = 'json' | 'openssh'

export type CommandSnippet = {
  id: string
  title: string
  body: string
}

export type TerminalThemeId = 'github-dark' | 'solarized-dark' | 'monokai'

export type TerminalPrefs = {
  themeId: TerminalThemeId
  fontFamily: string
  fontSize: number
  scrollback: number
}

export type AiChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type AiChatPayload = {
  messages: AiChatMessage[]
  targetSessionId?: string
  terminalExcerpt?: string
  /** 渲染进程为本轮用户提问生成的 ID，用于调试面板聚合 request/response */
  debugTurnId?: string
  /** 用于持久化历史的稳定键（如 saved profile id） */
  historyKey?: string
  /** 主机知识库 id（优先） */
  hostInventoryId?: string
  /** 用于查找档案的连接信息 */
  inventoryLookup?: { host?: string; port?: number; profileId?: string }
}

export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | {
      type: 'step'
      /**
       * 仅当 action=command 时由主进程生成：需用户确认后才执行。
       * tool_call(get_terminal_snapshot) 由系统自动执行，不会带 requestId。
       * 低风险自动批准时也可能不带 requestId，并带 autoApproved。
       */
      requestId?: string
      autoApproved?: boolean
      structured: AiAssistantReply
    }
  | { type: 'done' }
  | { type: 'cancelled'; message?: string }
  | { type: 'error'; message: string }
  | { type: 'debug'; payload: AiDebugStreamPayload }

export type AiProvider = {
  /** 唯一 ID；用于切换不同大模型地址/供应商 */
  id: string
  /** 仅用于界面展示，例如「ChatGPT」「DeepSeek」「Qwen」 */
  name: string
  /** OpenAI 兼容接口 base URL（例如带 /v1 的 DashScope URL） */
  baseURL: string
  /** 主进程本地存储的 API Key（不要在渲染进程控制台打印） */
  apiKey: string
  /** 当前 Provider 支持的模型 ID 列表（去重、非空；用于下拉选择） */
  modelList: string[]
}

export type AiSettings = {
  /** 多 Provider（多大模型地址/供应商）配置 */
  providers: AiProvider[]
  /** 当前请求使用的 Provider ID */
  activeProviderId: string
  /** 当前请求使用的模型 ID（须在 active provider 的 modelList 中） */
  model: string
  /** 对话采样温度 0–2 */
  temperature: number
  /**
   * 自定义说明：模型应如何从用户粘贴的整段文字里拆分 SSH 连接信息（主机、端口、用户等）。
   * 可与默认规则叠加。
   */
  sshParseInstructions: string
  /**
   * 使用项目内置 OpenClaw 风格核心智能体（Core-A：记忆、上下文工程、分步决策）。
   * 为 false 时仅用上方 Provider 直连模型。
   */
  useOpenClaw?: boolean
  /** riskLevel=low 的 command 自动执行，无需确认 */
  autoApproveLowRisk?: boolean
}

export type AiAssistantAction = 'tool_call' | 'command' | 'end'

export type AiGetTerminalSnapshotInput = {
  /** 读取最近终端输出行数（由 UI 实际截取并回传给模型） */
  maxLines?: number
  /** 从当前命令开始读取（命令+其后输出） */
  fromCurrentCommand?: boolean
  /** fromCurrentCommand=true 时，是否包含命令行 */
  includeCommandLine?: boolean
}

/** tool_call 通用输入（终端快照 + 主机知识库工具） */
export type AiToolInput = AiGetTerminalSnapshotInput & {
  hostId?: string
  query?: string
  note?: string
  serviceName?: string
  serviceKind?: string
  servicePorts?: number[]
  serviceNotes?: string
}

/** AI 助手单轮回复（模型应仅输出 JSON，解析成功后用于展示与“下一步动作”） */
export type AiAssistantReply = {
  /** 面向用户的说明与结论 */
  description: string
  /**
   * 下一步要做什么：
   * - tool_call：读取终端快照 / 主机档案等（多数自动执行）
   * - command：在终端执行命令（必须用户确认，除非低风险自动批准）
   * - end：任务完成，无需再执行下一步
   */
  action: AiAssistantAction
  completed?: boolean
  toolName?: string
  toolInput?: AiToolInput
  command?: string
  riskLevel: string
  notes?: string
}

/** 调试面板单条记录：模型一轮请求，或随后的工具/命令执行结果 */
export type AiDebugEntry =
  | {
      kind: 'model'
      /** 智能体循环步号（与界面「第 N 轮」对应） */
      round: number
      model: string
      temperature: number
      requestMessages: Array<{ role: string; content: string }>
      responseRaw: string
      structured: AiAssistantReply | null
      parseError?: string
    }
  | {
      kind: 'execution'
      round: number
      label: string
      detail?: string
    }

export type AiDebugStreamPayload = {
  debugTurnId: string
  userQuestion: string
  entry: AiDebugEntry
}

/** 从模型输出中解析 AiAssistantReply；支持外层 ```json 围栏或前后杂质 */
export function parseAiAssistantReply(raw: string): AiAssistantReply | null {
  let s = raw.trim()
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/im
  const fm = s.match(fence)
  if (fm) s = fm[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  try {
    const obj = JSON.parse(s) as Record<string, unknown>
    const description = typeof obj.description === 'string' ? obj.description.trim() : ''
    if (!description) return null
    const completed = typeof obj.completed === 'boolean' ? obj.completed : undefined
    const riskLevel = typeof obj.riskLevel === 'string' && obj.riskLevel.trim() ? obj.riskLevel.trim() : 'medium'
    const action =
      typeof obj.action === 'string' && (obj.action === 'tool_call' || obj.action === 'command' || obj.action === 'end')
        ? obj.action
        : typeof obj.command === 'string' && obj.command.trim()
          ? 'command'
          : 'end'
    const toolName = typeof obj.toolName === 'string' && obj.toolName.trim() ? obj.toolName.trim() : undefined
    let toolInput: AiToolInput | undefined
    if (obj.toolInput && typeof obj.toolInput === 'object' && !Array.isArray(obj.toolInput)) {
      const o = obj.toolInput as Record<string, unknown>
      const mi = o.maxLines
      if (typeof mi === 'number' && Number.isFinite(mi) && mi > 0) {
        toolInput = { ...(toolInput ?? {}), maxLines: Math.min(2000, Math.floor(mi)) }
      }
      if (typeof o.fromCurrentCommand === 'boolean') {
        toolInput = { ...(toolInput ?? {}), fromCurrentCommand: o.fromCurrentCommand }
      }
      if (typeof o.includeCommandLine === 'boolean') {
        toolInput = { ...(toolInput ?? {}), includeCommandLine: o.includeCommandLine }
      }
      if (typeof o.hostId === 'string' && o.hostId.trim()) {
        toolInput = { ...(toolInput ?? {}), hostId: o.hostId.trim() }
      }
      if (typeof o.query === 'string' && o.query.trim()) {
        toolInput = { ...(toolInput ?? {}), query: o.query.trim() }
      }
      if (typeof o.note === 'string' && o.note.trim()) {
        toolInput = { ...(toolInput ?? {}), note: o.note.trim() }
      }
      if (typeof o.serviceName === 'string' && o.serviceName.trim()) {
        toolInput = { ...(toolInput ?? {}), serviceName: o.serviceName.trim() }
      }
      if (typeof o.serviceKind === 'string' && o.serviceKind.trim()) {
        toolInput = { ...(toolInput ?? {}), serviceKind: o.serviceKind.trim() }
      }
      if (typeof o.serviceNotes === 'string' && o.serviceNotes.trim()) {
        toolInput = { ...(toolInput ?? {}), serviceNotes: o.serviceNotes.trim() }
      }
      if (Array.isArray(o.servicePorts)) {
        const ports = o.servicePorts
          .map((p) => (typeof p === 'number' ? Math.floor(p) : NaN))
          .filter((p) => p > 0 && p < 65536)
        if (ports.length) toolInput = { ...(toolInput ?? {}), servicePorts: ports }
      }
    }
    let command: string | undefined
    if (typeof obj.command === 'string' && obj.command.trim()) {
      command = obj.command.replace(/\r\n/g, '\n').replace(/[\r\n]+/g, ' ').trim()
    }
    const notes = typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim() : undefined
    return {
      description,
      action,
      // 如果模型没返回 completed，按 action 推断
      completed: typeof completed === 'boolean' ? completed : action === 'end',
      toolName,
      toolInput,
      command,
      riskLevel,
      notes
    }
  } catch {
    return null
  }
}

/** AI 解析粘贴文本后得到的连接表单字段（均为可选，仅填文本中明确出现的信息） */
export type AiParsedSshForm = {
  label?: string
  host?: string
  port?: number
  username?: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  /** 未能归入字段的说明 */
  notes?: string
}

export const TERMINAL_PREFS_DEFAULTS: TerminalPrefs = {
  themeId: 'github-dark',
  fontFamily: 'Cascadia Code, Consolas, "Courier New", monospace',
  fontSize: 14,
  scrollback: 4000
}
