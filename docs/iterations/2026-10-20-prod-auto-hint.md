# 2026-10-20 · 生产横幅与自动执行提示（路线图 2.4）

## 一、需求（PM）

- **问题**：M25 起生产主机不再限制 AI 策略（已定决策），生产主机上可以使用「自动执行」。现有横幅只写「生产环境 · 危险命令需输入主机名确认」，用户在生产主机上看不到 AI 正处于自动执行，容易误判。
- **用户故事**：作为在生产主机上使用 AI 的运维，当 AI 处于自动执行时，我希望在终端顶部的生产横幅上一眼看到这一点、知道策略来自哪里，并能一键改掉；但不希望因此被拦截或多一步确认。
- **验收标准**
  1. 生产主机、且实际生效策略为「自动执行」时，横幅额外显示「AI 自动执行」标签；同时放开高风险命令时显示「AI 自动执行 · 含高风险」并用危险色。
  2. 悬停说明当前策略、来源（全局 / 此主机 / 此标签页临时调整），以及高风险命令是否仍需确认，并写明「只做提醒，不会拦截」。
  3. 切换策略（全局设置、主机设置、输入框临时调整）后横幅实时更新，无需切换标签页。
  4. 非生产主机、只读主机、临时解除保护期间不显示该标签；不新增任何拦截或确认。
  5. 点击标签打开 AI 面板的执行策略菜单（自定义主题弹层，非原生下拉）。

## 二、交互与界面（设计）

```
┌ 生产环境 · 危险命令需输入主机名确认  (● AI 自动执行)  [临时解除…] [×] ┐   宽 ≥ 1101 px
┌ 生产环境 · 危险命令需输入主…  (● 自动)  [临时解除…] [×] ┐               窄 ≤ 1100 px
```

| 状态 | 表现 |
|---|---|
| 生产 + 自动执行 | 标签：18 px 高胶囊，`--radius-pill`，警示色描边 `color-mix(--color-warn 55%)`、底 `color-mix(--color-warn 16%)`，6 px 圆点 `--color-warn`，字号 `--fs-xs` |
| 生产 + 自动执行 + 高风险 | 同上换为 `--color-danger`，文字「AI 自动执行 · 含高风险」 |
| 生产 + 仅建议 / 执行前确认 | 不显示标签，横幅保持原样 |
| 临时解除保护（倒计时中） | 横幅显示倒计时，不叠加标签 |
| 只读主机 | 只读横幅，不显示（只读会把策略压为仅建议） |
| 悬停 | 背景加深到 26%；`title` 为完整说明 |
| 点击 | 打开右侧 AI 面板（若隐藏），并弹出输入框上的「AI 执行策略」主题弹层 |

标签放在横幅文字之后、「临时解除」之前，与横幅同一行，横幅高度保持 24 px，不挤压终端区域。不做加载态：策略在设置读取完成前按默认「执行前确认」计算，不显示标签。

### 文案

| key | 中文 | English |
|---|---|---|
| prodAuto.chip | AI 自动执行 | AI Auto run |
| prodAuto.chipHigh | AI 自动执行 · 含高风险 | AI Auto run · incl. high risk |
| prodAuto.chipShort | 自动 | Auto |
| prodAuto.tip | 当前 AI 执行策略：自动执行（{source}）。中、低风险命令会直接写入这台生产主机的终端，不再逐条确认{high}。这里只做提醒，不会拦截；点击可在 AI 面板中更改策略。 | Current AI execution policy: Auto run ({source}). Low- and medium-risk commands are written straight to this production host's terminal without per-command confirmation{high}. This is a reminder only and blocks nothing; click to change the policy in the AI panel. |
| prodAuto.high / highOff | ，高风险命令也会自动执行 / ；高风险命令仍需确认 | , and so are high-risk commands / ; high-risk commands still ask first |

`{source}` 复用已有的 `policy.source.*`（来源：全局设置 / 此主机设置 / 此标签页临时调整）。

## 三、实现（开发）

- `src/shared/prod-auto-hint.ts`：`prodAutoHint({ level, paused, policy })`，纯函数，只在生产、未临时解除、生效策略为 auto 时返回 `{ source, autoHighRisk }`。
- `App.tsx`：读取 AI 全局策略（`aiss-ai-settings-saved` 时刷新），与主机策略、当前标签页临时策略一起用 `resolveAiPolicy` 计算；横幅加 `data-ai-policy="auto"` 与 `banner-ai-auto` 标签。
- `AIPanel.tsx`：监听 `aiss-open-ai-policy`，打开执行策略弹层。

## 四、测试

- 单元测试 `scripts/test-prod-auto-hint.ts`：三种来源、高风险、临时改回执行前确认、非生产 / 临时解除 / 只读不显示、生产不压策略、接线与文案。
- 截图（`docs/screenshots/iteration-2026-10-20-q4/`，深色 + 浅色）：`*-prod-auto.png`（宽）、`*-prod-auto-narrow.png`（960 宽，短文案）、`*-prod-auto-pop.png`（点击后打开策略弹层）、`*-prod-ask.png`（同一会话内改回执行前确认后标签消失，验证实时更新）。
