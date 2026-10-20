# 2026-10-20 · 对话内执行回放（路线图 2.3）

## 一、需求（PM）

- **问题**：历史对话按主机分组保存，但恢复后只看得到 AI 的建议命令，看不到这条命令有没有真的执行、执行了多久、输出了什么，复盘时只能翻终端或审计日志逐条对照。
- **用户故事**：作为排障后需要复盘的运维，我打开某台主机的历史对话时，希望每条已执行的命令下面直接看到状态、耗时和输出摘要，并能一键跳到对应的审计记录。
- **验收标准**
  1. AI 写入终端的每条命令，在对应命令卡片下出现一行执行记录：状态（成功 / 失败 / 已执行 / 已拦截）、耗时、输出行数。
  2. 点击该行可展开输出摘要（最多最后 8 行、800 字符，已按审计规则脱敏），再点收起。
  3. 「审计记录」打开审计日志并滚动、高亮对应行；执行时审计未开启时按钮仍可点击，悬停说明原因，打开后不高亮；记录已被清空时审计页顶部提示「没有找到该记录」。
  4. 执行记录随对话历史持久化；重启或切换对话后恢复，旧格式历史（无记录）不受影响。
  5. 拿不到退出码时不猜测成败，显示「已执行」并在展开区说明以终端输出为准。
  6. 被只读保护拦截的命令显示「已拦截」，不显示耗时与输出。

## 二、交互与界面（设计）

### 位置与层级
沿用 Cursor 风格 AI 面板的卡片结构：命令代码块（`.ai-reply-cmd`）之下、「用时 Ns」元信息之上，插入一行 26 px 高的执行记录条，不新建卡片，避免打断阅读流。

```
┌ shell  风险: low                     ⧉ ┐
│ ps aux --sort=-%mem | head -n 11        │
│ 已执行                                  │
└─────────────────────────────────────────┘
┌ › ● 已执行 · 耗时 1.2 s · 输出 11 行 │ ▤ 审计记录 ┐   ← 收起（默认）
└────────────────────────────────────────────────────┘
┌ ⌄ ● 失败 · 退出码 1 · 耗时 860 ms   │ ▤ 审计记录 ┐   ← 展开
│ Job for nginx.service failed because …             │
│ See "systemctl status nginx.service" …             │
└────────────────────────────────────────────────────┘
```

### 状态

| 状态 | 圆点 | 状态文字 | 其余 |
|---|---|---|---|
| 成功（退出码 0） | `--color-ok` | 次要文字色 | 耗时、行数 |
| 失败（非零 / 超时 / 写入失败） | `--color-danger` | `--color-danger`，附「退出码 N」 | 耗时、行数 |
| 已执行（无退出码，当前 SSH 实现的常态） | `--color-text-muted` | 次要文字色 | 展开区附说明 |
| 已拦截（只读主机） | `--color-warn` | 次要文字色 | 不显示耗时 / 行数；展开区说明未写入 |
| 无输出 | — | — | 行数位置显示「无输出」，展开区「执行后未采集到输出。」 |
| 审计不可用 | — | 「审计记录」降为 muted 色、`aria-disabled`，仍可点击打开审计日志，`title` 写明原因 | — |

不做加载态：记录在命令输出采集完成后一次性写入，之前不占位。

### 规格
- 容器：1 px `--color-border-muted` 描边，`--radius-md`，上边距 `--space-2`；字号 `--fs-xs`，颜色 `--color-text-muted`。
- 行内间距 `--space-2`，分隔符「·」；窄面板下只截断最后一个元信息（省略号），状态与耗时不截断；「审计记录」固定靠右，左侧 1 px 分隔线，强调色 `--color-accent`。
- 展开区：上边 1 px 分隔，内边距 `--space-2`；输出用 `--font-mono`、`white-space: pre`、最大高度 160 px，横向 / 纵向滚动，不折行（保持 ps / df 等表格对齐）。
- 悬停：整行与「审计记录」文字转为 `--color-text-secondary`；切换按钮 `title` 同时给出完整执行时间。
- 已执行的历史命令不再显示「同意并执行 / 不同意」，而是显示「已执行」。
- 审计页：被定位行背景 `color-mix(--color-accent 14%)`，`aria-current="true"`，自动滚动到视口中部；超出 200 条显示上限时也会置顶显示。

### 文案

| key | 中文 | English |
|---|---|---|
| exec.status.ok / failed / sent / blocked | 成功 / 失败 / 已执行 / 已拦截 | Succeeded / Failed / Ran / Blocked |
| exec.exit | 退出码 {code} | exit code {code} |
| exec.duration | 耗时 {d} | Took {d} |
| exec.lines / noOutputShort | 输出 {n} 行 / 无输出 | {n} lines of output / No output |
| exec.audit | 审计记录 | Audit record |
| exec.auditMissing | 执行时审计日志未开启或记录已被清空，没有对应记录；仍可打开审计日志查看 | The audit log was off when this ran, or the record was cleared, so there is no matching entry; you can still open the audit log |
| exec.tailNote | 仅显示最后 {n} 行，共 {total} 行；完整输出请在终端中查看。 | Showing the last {n} of {total} lines; see the terminal for the full output. |
| exec.sentNote | 命令已写入终端，当前连接未报告退出码，状态以终端输出为准。 | The command was written to the terminal. This connection does not report exit codes, so check the terminal output for the result. |
| exec.blockedNote | 主机处于只读保护，命令未写入终端。 | The host is read-only protected, so the command was not written to the terminal. |
| exec.notFound | 审计日志中没有找到该记录，可能已被清空或超出保留条数。 | This record is not in the audit log; it may have been cleared or aged out. |

## 三、实现（开发）

- `src/shared/ai-exec-replay.ts`：`ExecRecord` 类型、`summarizeExecOutput()`（取命令回显之后、结尾提示符之前的输出尾部，去 ANSI、脱敏）、`execStatusFrom()`、`normalizeExecRecord()`、`formatExecDuration()`。
- 主进程 `ai-interactive-agent.ts`：写入终端前记时，采集输出后发送 `exec` 流事件；只读拦截时发送 `status: 'blocked'`。耗时口径为「写入终端 → 自动采集到输出」，含固定的输出等待时间。
- `ipc.ts` / `ai-chat-history.ts`：`AiChatMessage.exec` 持久化并在读取时校验。
- `AIPanel.tsx`：`audit` 事件记下审计 id，`exec` 事件按 requestId / 命令文本挂到对应步骤并写入历史；渲染 `ExecReplay`。
- `App.tsx` / `AuditLogPanel.tsx`：`aiss-open-audit` 事件打开审计页并定位 `focusId`。

## 四、测试

- 单元测试 `scripts/test-exec-replay.ts`：摘要截取 / 去 ANSI / 截尾 / 脱敏、状态判定（无退出码不判成功）、历史往返、旧历史兼容、各处接线与中英文文案。
- 截图（`docs/screenshots/iteration-2026-10-20-q4/`，深色 + 浅色）：`*-ai-exec-replay.png`（展开）、`*-ai-exec-collapsed.png`（960 宽收起）、`*-ai-exec-failed.png`（失败 · 退出码 1、无审计 id）、`*-ai-exec-audit.png`（审计页高亮定位行）。截图数据来自截图模式的演示对话（与恢复历史走同一渲染路径），不是真实主机。
