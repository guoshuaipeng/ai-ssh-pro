# 2026-10-20 · AI 命令退出码采集（需求池 B1）

## 一、需求（PM）

- **问题**：`readConfirmedCommandOutcome()` 依赖的 `confirmedCommandOutcome` 探针在生产 SSH 管理器里没有实现，执行回放在真实主机上几乎都只能显示「已执行」；`classifyCommandFailure` 的非零退出判定和「连续失败拒绝」也只在写入失败时生效。
- **用户故事**：作为开启自动执行的运维，我希望 AI 执行的每条命令都有明确的成功 / 失败和退出码，AI 也能据此判断下一步，而不用我逐条翻终端。
- **验收标准**
  1. bash / sh（dash）下 `true` / `false` / `(exit 7)` / 管道失败分别得到 0 / 1 / 7 / 1，回放显示「成功」或「失败 · 退出码 N」。
  2. 标记不出现在终端画面、录像、给 AI 的快照和回放摘要里；命令回显中的 printf 后缀在交给 AI / 回放的文本中被去掉。
  3. 交互式、后台、heredoc、续行、切换 shell / 进入其他会话的命令不追加。
  4. 退出码进入现有失败判定（非零 → `nonzero`，计入连续失败）。
  5. 等待上限 10 秒（`AISS_EXIT_WAIT_MS` 可调，500 ms–60 s）；超时、命令不适用、功能关闭、shell 不支持时，回放显示「已执行」并写明具体原因。
  6. 「设置 → AI 执行策略」可关闭，默认开启。

## 二、交互与界面（设计）

### 设置
「每轮步数上限」下方新增一行复选框（与现有 `.l4-check` 样式一致）：

- 文案：**采集 AI 命令的退出码** / *Capture exit codes of AI commands*
- 说明（`.l7-muted`）：在 AI 执行的命令末尾追加一段 printf，用于判断成功或失败；终端回显中会看到这段后缀，交给 AI 和回放的输出已去除。适用于 bash / zsh / sh 等 POSIX shell；交互式与后台命令不追加。
- 切换即保存，沿用「已保存」提示，不弹确认。

### 回放状态（沿用 2.3 的执行记录行）

| 情况 | 状态 | 展开区说明 |
|---|---|---|
| 退出码 0 | ● 成功（`--color-ok`） | — |
| 非零 / 超时 / 写入失败 | ● 失败 · 退出码 N（`--color-danger`） | — |
| 10 秒内未结束 | ● 已执行 | 命令在 10 秒内没有结束，暂未拿到退出码；AI 已先读取当前输出继续，结果以终端为准。 |
| 命令不适用 | ● 已执行 | 这类命令（交互式、后台运行、heredoc、切换 shell 等）不采集退出码，状态以终端输出为准。 |
| shell 不支持（连续两次无标记，如 fish） | ● 已执行 | 这台主机的 shell 连续两次没有返回退出码标记（例如 fish），本次连接已停止追加，状态以终端输出为准。 |
| 设置中关闭 | ● 已执行 | 退出码采集已在「设置 → AI 执行策略」中关闭，状态以终端输出为准。 |

英文文案见 `i18n.tsx` 中 `exec.noExit.*`、`policy.exitCapture*`。不新增加载态：等待退出码期间沿用现有「正在生成第 n 步」状态。

## 三、实现（开发）

- `src/shared/exit-marker.ts`：`exitMarkerEligible()`、`wrapWithExitMarker()`（`<cmd>; printf '\033]777;aiss-exit;%s;%d\007' <nonce> $?`）、流式 `ExitMarkerParser`（跨 chunk、BEL / ST 两种结束符、非本标记的 OSC 原样放行）、`stripEchoedMarker()`（含终端折行）。
- `src/main/exit-capture.ts`：`ExitCaptureRegistry`，按会话管理 nonce、等待、结果、超时计数与「不支持」判定；不依赖 Electron，可单测。
- `ssh-manager.ts`：stdout 先经过标记剥离再进 ring / 录像；`writeAiCommand()`、`waitCommandExit()`、`confirmedCommandOutcome()`；快照去掉回显后缀；断开时释放等待。演示主机不追加。
- `ai-interactive-agent.ts`：写入走 `writeAiCommand`；有 nonce 时等待退出码（替代固定 800 ms 等待），再取快照；`exec` 记录带 `noExit` 原因。
- 设置 `aiExitCapture`（只在关闭时存储）。

## 四、测试

- `scripts/test-exit-capture.ts`：适用性、包装、解析（分片 / ST / 非本标记）、回显剥离；在本机真实 shell（Git bash、Git sh）中执行包装后的命令核对退出码（8 项）；失败判定与记录校验、接线。另在 Linux 上手动用 dash / bash 核对了 4 类命令的退出码。
- `scripts/test-exit-capture-manager.ts`：注册表全流程（分片、已到达、中止、断开、fish 类 shell 两次超时后停止追加、慢命令不误判为不支持）。
- 截图（`docs/screenshots/iteration-2026-10-20-c2/`）：`*-settings-ai-exit.png`、`*-ai-exec-replay.png`（成功 · 退出码 0）、`dark-ai-exec-failed.png`。

## 五、已知限制

- 终端回显里能看到 printf 后缀（PTY 会回显输入），这是不改远端 shell 配置前提下的取舍，已在设置说明中写明并可关闭。
- zsh、fish 未在真实环境验证；fish 不支持 `$?`，靠「两次无标记即停用」兜底，前两条命令会各等待 10 秒。
- 未连接真实 SSH 主机做端到端验证。
