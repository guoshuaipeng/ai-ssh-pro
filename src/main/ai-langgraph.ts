import type { WebContents } from 'electron'
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { ChatOpenAI } from '@langchain/openai'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'
import type { AiChatPayload, AiSettings, AiStreamEvent } from '../shared/ipc'
import type { SshSessionManager } from './ssh-manager'
import { streamOpenAICompatibleChat } from './ai-stream'

function send(wc: WebContents, ev: AiStreamEvent): void {
  if (!wc.isDestroyed()) {
    wc.send('ai:stream', ev)
  }
}

function toLcMessages(messages: AiChatPayload['messages']): BaseMessage[] {
  const out: BaseMessage[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push(new HumanMessage(m.content))
    else if (m.role === 'assistant') out.push(new AIMessage(m.content))
    else out.push(new SystemMessage(m.content))
  }
  return out
}

const assistantReplySchema = z.object({
  description: z.string().describe('结论、步骤或原因；说明是否需用户确认后再执行命令'),
  command: z.string().optional().describe('建议执行的单行完整命令；不需要则省略'),
  riskLevel: z.enum(['low', 'medium', 'high']).describe('风险等级'),
  notes: z.string().optional().describe('回滚、备份或需先确认的信息')
})

function buildSystemPrompt(payload: AiChatPayload): string {
  const parts: string[] = [
    '你是运维/开发助手，结合用户问题与终端上下文给出 Shell 与排错建议。',
    '在需要时调用工具 get_terminal_snapshot 读取当前关联 SSH 会话的最近终端输出；不要虚构终端内容。',
    '中间推理可用自然语言；最终答案由系统汇总为结构化 JSON 呈现给用户。',
    '不要假设用户已执行命令；高风险操作须在说明中明确提示。'
  ]
  if (payload.targetSessionId) {
    parts.push(`当前关联的 SSH 会话 ID：${payload.targetSessionId}（仅作上下文，不是秘密）。`)
  } else {
    parts.push('当前未关联 SSH 会话：工具 get_terminal_snapshot 将返回提示，请勿编造输出。')
  }
  if (payload.terminalExcerpt?.trim()) {
    parts.push('用户随消息附带的终端片段（可能含敏感信息）：\n```\n' + payload.terminalExcerpt.trim() + '\n```')
  }
  return parts.join('\n')
}

export async function runLangGraphAgentChat(
  wc: WebContents,
  settings: AiSettings,
  payload: AiChatPayload,
  ssh: SshSessionManager
): Promise<void> {
  const apiKey = settings.apiKey.trim()
  if (!apiKey) {
    send(wc, { type: 'error', message: '请先在设置中填写 API Key（主进程存储，不进入渲染进程日志）。' })
    return
  }

  const baseURL = settings.baseURL.replace(/\/$/, '')
  const temperature =
    typeof settings.temperature === 'number' && Number.isFinite(settings.temperature)
      ? Math.min(2, Math.max(0, settings.temperature))
      : 0.1

  const targetSessionId = payload.targetSessionId

  const getTerminalSnapshot = tool(
    async (input: { maxLines?: number }) => {
      const maxLines = typeof input.maxLines === 'number' && input.maxLines > 0 ? Math.min(500, input.maxLines) : 200
      if (!targetSessionId) {
        return '（当前未关联 SSH 会话，无法读取终端。请先连接并选中标签页，或勾选附带终端输出。）'
      }
      const snap = ssh.getRingSnapshot(targetSessionId, maxLines)
      if (snap == null || !snap.trim()) {
        return '（该会话暂无缓冲输出或会话已断开。）'
      }
      return snap
    },
    {
      name: 'get_terminal_snapshot',
      description:
        '读取当前用户选中的 SSH 会话终端环形缓冲中最近若干行文本，用于排错、解释报错与生成命令。无选中会话时不要虚构内容。',
      schema: z.object({
        maxLines: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('最多读取行数，默认 200，最大 500')
      })
    }
  )

  const llm = new ChatOpenAI({
    model: settings.model,
    apiKey,
    temperature,
    configuration: { baseURL }
  })

  const agent = createReactAgent({
    llm,
    tools: [getTerminalSnapshot],
    prompt: buildSystemPrompt(payload),
    responseFormat: {
      schema: assistantReplySchema,
      prompt:
        '根据完整对话与工具结果，生成面向用户的最终回复字段：description 为清晰结论与步骤；command 为单行可选命令（无则省略）；riskLevel；notes 为补充注意点。'
    }
  })

  const messages = toLcMessages(payload.messages)

  try {
    const result = await agent.invoke(
      { messages },
      { recursionLimit: 25 }
    )

    const structured = result.structuredResponse as z.infer<typeof assistantReplySchema> | undefined
    if (!structured?.description) {
      send(wc, { type: 'error', message: '模型未返回有效的结构化回复。' })
      return
    }

    const text = JSON.stringify({
      description: structured.description,
      ...(structured.command?.trim() ? { command: structured.command.replace(/[\r\n]+/g, ' ').trim() } : {}),
      riskLevel: structured.riskLevel,
      ...(structured.notes?.trim() ? { notes: structured.notes.trim() } : {})
    })

    send(wc, { type: 'delta', text })
    send(wc, { type: 'done' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ai] LangGraph 失败，回退为单次流式 JSON 对话:', msg)
    await streamOpenAICompatibleChat(wc, settings, payload)
  }
}
