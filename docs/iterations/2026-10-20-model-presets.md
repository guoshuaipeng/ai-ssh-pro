# B2 模型预设：国产模型 + 本机 Ollama（2026-10-20，周期 2）

路线图 2.5 · P1

## 1. 需求（PM）

**问题**：新用户配置 AI 时要自己查 Base URL 和模型名，常见错误有：漏写 `/compatible-mode/v1`、把 `/chat/completions` 也填进去、地域和 Key 不匹配。本机 Ollama 不需要 Key，但现在必须填 Key 才能用。

**用户故事**：作为用户，我在 设置 → AI 点「从预设添加」，选择「DeepSeek」或「Ollama（本机）」，Base URL 和模型列表自动填好，我只需要粘贴 Key（Ollama 连 Key 都不用）就能测试连接并开始对话。

**验收标准**
1. 「添加 Provider」旁边有「从预设添加 ▾」，点击后弹出主题化菜单（复用 ContextMenu，不用原生 select）。每项显示名称，右侧是主机名，悬停显示完整 Base URL。
2. 预设只收录能在官方文档核实的地址（2026-10-20 核实）：

| 预设 | Base URL | 模型（文档示例） | 文档 |
|---|---|---|---|
| 阿里云百炼·千问（北京） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen3.8-max, qwen3.7-plus | help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope |
| 阿里云百炼·千问（新加坡） | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | 同上 | 同上（文档说明旧域名仍可用） |
| DeepSeek | `https://api.deepseek.com` | deepseek-flash, deepseek-v4-pro | api-docs.deepseek.com |
| 月之暗面·Kimi | `https://api.moonshot.cn/v1` | kimi-k3, kimi-k2.6, kimi-k2.7-code-highspeed | platform.moonshot.cn/docs/guide/start-using-kimi-api |
| 智谱·GLM | `https://open.bigmodel.cn/api/paas/v4` | glm-5.3, glm-5.3-flash | docs.bigmodel.cn/cn/guide/develop/openai/introduction |
| Ollama（本机） | `http://localhost:11434/v1` | qwen3:8b, gpt-oss:20b | docs.ollama.com/api/openai-compatibility |

   OpenAI、豆包、混元等本轮没有核实，不收录。
3. 选中后会新建一个 Provider（不覆盖当前 Provider），名称、Base URL、模型列表都可以继续编辑。
4. Base URL 与某个预设一致时，下方显示该预设的说明（例如百炼建议改用业务空间专属域名、Key 按地域绑定；Ollama 需先 pull 模型）和「查看官方文档」链接（用系统浏览器打开）。
5. 回环地址（localhost、127.x、::1）的 Base URL 允许不填 Key。此时不发送 Authorization 头；API Key 输入框的占位符改为「本机服务无需 API Key，可留空」。测试连接、对话、Agent、SSH 解析、选中解释这几条请求路径都按同一规则处理。`localhost.evil.com` 这类地址不算回环。
6. 远端地址仍然必须填 Key，原有提示不变。

## 2. 交互 / UI
- 按钮：与「添加 Provider」同一个按钮样式，文字后面带 ▾，`aria-haspopup="menu"`。
- 菜单：ContextMenu 定位在按钮左下方 4px 处。`ctx-shortcut` 槽位显示主机名，`title` 显示完整 URL。
- 说明行 `.ai-preset-note`：`--fs-xs`，颜色 `--color-text-secondary`，上边距 `--space-1`；链接按钮颜色 `--color-accent`，悬停加下划线。
- 状态：没有空状态（预设列表固定）；没有 loading；不涉及禁用。错误沿用测试连接已有的错误提示。
- 文案：`aiPreset.add` 从预设添加 / Add from preset；`aiPreset.docs` 查看官方文档 / Official docs；`aiPreset.keyOptional` 本机服务无需 API Key，可留空 / Local server: API key not needed, leave empty；预设说明的中英文写在 `src/shared/ai-presets.ts`。

## 3. 实现
- `src/shared/ai-presets.ts`：`AI_PRESETS`、`findPreset`、`matchPreset`、`keyOptional`、`hasUsableKey`、`aiAuthHeaders`。
- 主进程 `ai-stream`、`ai-interactive-agent`、`ai-parse-ssh`、`ai-assist` 和 `index.ts`（测试连接）统一使用 `hasUsableKey` 和 `aiAuthHeaders`；渲染层 AIPanel、ai-events、App 判断「已配置」时也用同一规则。
- 测试：`scripts/test-ai-presets.ts` 固定 5 个已核实的地址，校验每个预设都带 https 文档链接、keyRequired 与是否回环一致、无 Key 时的请求头、测试连接的校验逻辑。

## 4. 风险
- 模型名更新很快，预设里只放文档示例，用户应以控制台为准。
- 没有用真实 Key 或本机 Ollama 做端到端调用。
