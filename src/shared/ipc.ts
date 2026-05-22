/** 主菜单 / 工具栏打开的对话框类型 */
export type AppDialogKind = 'connection' | 'ai' | 'debug'

export type SessionMeta = {
  host: string
  port: number
  username: string
  label?: string
  connectedAt: number
  termCols: number
  termRows: number
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
}

export type SshConnectResult = {
  sessionId: string
  meta: SessionMeta
}

export type SshDataEvent = {
  sessionId: string
  chunk: string
}

export type SshStatusEvent = {
  sessionId: string
  status: 'connected' | 'error' | 'closed'
  message?: string
}

export type SshSnapshotOptions = {
  /** 读取最近终端输出行数 */
  maxLines?: number
  /** 从“当前命令”开始读取（命令本身 + 其后输出） */
  fromCurrentCommand?: boolean
  /** fromCurrentCommand=true 时，是否包含命令行文本（默认 true） */
  includeCommandLine?: boolean
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
}

export type SessionImportPickResult = {
  items: ImportedSessionDraft[]
  /** 人类可读提示，如跳过原因 */
  notes: string[]
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
}

export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | {
      type: 'step'
      /**
       * 当 action 为 tool_call / command 时，主进程会先把这一步展示给用户，
       * 然后等待用户确认后继续；此 requestId 用于用户在 UI 点击后回传给主进程。
       */
      requestId?: string
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

/** AI 助手单轮回复（模型应仅输出 JSON，解析成功后用于展示与“下一步动作”） */
export type AiAssistantReply = {
  /** 面向用户的说明与结论 */
  description: string
  /**
   * 下一步要做什么（且都需要用户同意/确认后执行）：
   * - tool_call：请求 UI 调用指定工具（本项目当前主要是 get_terminal_snapshot）
   * - command：请求 UI 在终端执行指定命令
   * - end：任务完成，无需再执行下一步
   */
  action: AiAssistantAction
  /**
   * 是否已完成当前任务。
   * - true：action=end 的含义（或任务已满足，后续可停止）
   * - false：需要继续执行/轮询
   */
  completed?: boolean
  /** 工具名；当 action=tool_call 时建议给出具体工具名，例如 get_terminal_snapshot */
  toolName?: string
  /** 工具输入参数；当 action=tool_call 时建议给出可选的参数 */
  toolInput?: AiGetTerminalSnapshotInput
  /** 建议执行的完整命令；单行，勿含换行 */
  command?: string
  /** 风险等级，如 low / medium / high */
  riskLevel: string
  /** 补充注意点、回滚或确认项 */
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
    let toolInput: AiGetTerminalSnapshotInput | undefined
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
