# AI 对话操作软件功能（AI App Actions）设计

> 第 53 轮起。代码：`src/shared/ai-actions.ts`（注册表、净化、状态机、纯执行器）、`components/AiActionCard.tsx`（确认 UI）、`App.tsx onAppAction`（执行器接线）。

## 1. 原则
1. **AI 只提议，不执行**：模型只能返回 `appAction { name, params }`。UI 渲染一张预填好的操作卡片，用户点「确认执行」后才调用执行器。这和「AI 命令只填进输入框」的原则一致。
2. **敏感字段不进不出**：注册表里 `type: 'secret'` 的字段（密码、私钥路径、口令）不会出现在给模型的提示中。即使模型在返回里填了这些字段，`sanitizeProposal` 也会丢弃。卡片里这些字段始终为空，只能由用户手动输入，输入值只交给本地执行器。
3. **上下文先脱敏**：主进程把系统提示、终端片段和历史消息发给模型之前，先经过 `redactForAi`，处理密码/口令/私钥块/Bearer/sk-/sshpass -p 等内容。
4. **白名单**：只接受注册表中已有的动作名和字段；未知字段、非法枚举值、非数字一律丢弃。

## 2. 交互
- **出现位置**：AI 回复卡片（结论卡）下方，带「AI 建议的操作」徽标和动作标题。
- **表单**：采用两列的「标签 | 控件」结构，与设置行一致。必填项带 *。下拉使用 ui/Select；数字字段有范围校验。
- **参数缺失时追问**：点击确认时如果有必填项为空或超出范围，不执行，卡片顶部显示「还需要：主机、用户名」（role=alert），并把对应字段标红。用户补全后再次确认即可执行。卡片本身就是追问的载体，不需要再来回一轮对话。
- **取消**：状态变为「已取消」，表单禁用，之后任何点击都不会执行（终态）。
- **重复点击**：执行中按钮显示「执行中…」并禁用。状态机在 running 阶段忽略 confirm 和 cancel，组件再用 ref 防止重入，所以执行器只会被调用一次。done 也是终态。
- **结果**：成功时显示执行器返回的提示（例如「已保存连接 deploy@10.0.0.5」）；失败时显示错误，可以修改后重试。

## 3. 注册表结构
```ts
ActionDef  = { name, titleKey, hint /* 给模型的一行说明 */, fields: ActionField[] }
ActionField = { key, labelKey, type: text|number|select|secret, required?, options?, min?, max?, def?, showIf? }
执行器（renderer）：onAppAction(name, values) => Promise<{ ok, message? }>
```
新增一个动作需要四步：在注册表加一个 ActionDef、在 i18n 加 `aa.*` 键、在 `App.onAppAction` 加一个分支（最好调用 shared 里的纯函数）、补测试。提示词由 `actionsPrompt()` 根据注册表自动生成。

## 4. 动作清单
| 动作 | 状态 | 参数（* 必填，🔒 只能由用户填写） | 执行器 |
|---|---|---|---|
| connection.add 添加连接 | ✅ c53 | label, host*, port(22), username*, auth(key/password/agent), 🔒password, 🔒privateKeyPath | `buildProfileFromAction`：同一 host+port+user 时更新而不是新增，然后 persistSessionState |
| monitor.configure 配置监控 | ✅ c53 | metric*(cpu/mem/disk/offline), threshold*(1–100，offline 不需要), sustainMin(5), enabled | `applyMonitorAction` 后执行 saveAlertRules |
| sftp.open 打开 SFTP | ✅ c54 | target*（名称 / user@host / 主机） | `findProfileForAction` → openSftpFromHost |
| snippet.create 新建片段 | ✅ c54 | title*, command*, category | `buildSnippetFromAction` → snippets.save |
| forward.create 新建端口转发 | ✅ c54 | localPort*, remoteHost(127.0.0.1), remotePort*（作用于当前会话） | `forwardRequestFromAction` → forwards.add |
| playbook.run / alert.mute / connection.connect | 计划 | 待定 | 待定 |

## 4.1 扩展清单（c54 立项，按使用频率排序；从第 55 轮起每轮做 2–3 个）
排序依据：日常主路径推断（连接 → 命令输入 → SFTP → 片段/剧本 → 监控告警 → 整理与设置），没有埋点数据。🔴 = 高风险，确认时要二次确认（第一次点击后按钮变为「再次确认」，3 秒内不点就恢复）。
| # | 动作 | 分类 | 参数要点 | 风险 |
|---|---|---|---|---|
| 1 | connection.open 打开连接（含批量） | 连接 | targets*（名称/主机，多个） | 批量 >5 台 🔴 |
| 2 | history.fill 从历史搜索并填入命令栏 | 命令 | query* | 只填不发 |
| 3 | sftp.open 定位到目录 | SFTP | 在已完成的 target 上加 path | — |
| 4 | snippet.create / playbook.create 新建片段或剧本 | 命令 | title*, command(s)* | — |
| 5 | sftp.transfer 上传/下载指定文件 | SFTP | target*, direction*, remotePath*, localPath* | 覆盖已有文件 🔴 |
| 6 | batch.prefill 批量执行（只填好，由用户发送） | 命令 | targets*, command* | 🔴 |
| 7 | monitor.open 打开资源监控 | 监控 | target | — |
| 8 | playbook.fromRecent 把最近执行的命令存成剧本 | 命令 | count(10), title* | — |
| 9 | alert.explain 查看最近告警并归因 | 监控 | alertId / 最近一条 | 只读 |
| 10 | connection.organize 分组、重命名、打标签 | 连接 | target*, folder, label, tags | — |
| 11 | settings.set 修改主题、字号 | 运维 | theme, fontSize(10–24) | — |
| 12 | split.layout 分屏布局 | 连接 | layout*(2/3/4), targets | — |
| 13 | connection.protect 标记生产/只读 | 连接 | target*, level* | 降级（解除保护）🔴 |
| 14 | jump.configure 跳板机配置 | 运维 | target*, jumpHost*, jumpUser | — |
| 15 | sftp.compare 对比两台机器上的同一文件 | SFTP | left*, right*, path* | 只读 |
| 16 | audit.export 导出审计日志 | 运维 | range, format | — |
| 17 | monitor.schedule 定时巡检 | 监控 | targets*, playbook*, cron* | 🔴 |
| 18 | connection.delete / snippet.delete 删除 | 连接/命令 | target* | 🔴 |
已完成：connection.add、monitor.configure（c53）；sftp.open、snippet.create、forward.create（c54）；connection.open（含批量、二次确认）、history.fill、sftp.open 定位目录（c55）。端到端场景见 screenshot-key-screens 中的 e2e-*，真实模型评测见 scripts/eval。
第 55 轮建议：#1 connection.open、#2 history.fill、#3 sftp.open 定位目录，同时实现二次确认机制（ActionDef 加 `risk: 'high'`）。

每次执行都会写一条审计 `ai.action`（source=AI），detail 只含非敏感字段。交互代理（ai-interactive-agent）同样会追加动作提示、净化 appAction，并对上下文脱敏。

## 5. 测试
`scripts/test-ai-actions.ts` 覆盖：注册表、净化（丢弃敏感字段/未知字段/非法值）、提示词不暴露敏感参数、回复解析、脱敏、缺参追问、取消终态、执行中重复点击、done 终态、端口范围、两个执行器（新增/去重/纯函数/禁用规则）以及接线。截图场景 `ai-action-*` 用于设计师验收。
