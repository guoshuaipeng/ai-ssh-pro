# AI 动作标准（c62 起，配置驱动）

AI 动作不再逐个手写执行分支：每个动作是 `src/shared/ai-actions.ts` 里的一条 `ActionDef` 配置，执行统一走 `runAction` → 应用内命令总线（`src/shared/command-bus.ts`）。

## 新增一个动作要写的东西
1. **ActionDef 一条**（`AI_ACTIONS` 数组）：
   - `name` / `titleKey` / `hintKey` / `fields`（字段类型：text、select、secret…；secret 字段永远不由 AI 填、不进提示词、不进审计）。
   - `command`：命令总线上的命令名，例如 `forwards.add`。
   - `args`：命令参数 → 字段名的映射。
   - `target?`：`{ field, many?, notDemoKey? }`，按连接名解析目标；找不到给 `aa.noTarget`，演示主机可拒绝。
   - `requires?: 'activeSession'`：没有活动会话时给 `aa.noSession`。
   - `checks?`：前置校验 `{ validator: 'sftpPath' | 'transferPaths' | 'nonEmpty', field?, messageKey }`。
   - `risk?`：高风险规则 `{ always: true }`、`{ field, equals }` 或 `{ field, listAtLeast }`，命中即二次确认；可配 `riskNoteKey`。
   - `audit?: { hostField? }`：审计里记哪个字段当主机。
2. **命令处理函数一个**：在 `App.tsx` 的 `commandBusRef` 块里 `bus.register('<command>', async ({ args, profiles, sessionId }) => ...)`，只写业务本身，返回 `{ ok, message? }`。不要写校验、确认、审计，这些由 `runAction` 和卡片统一处理。
3. **i18n**：标题、提示、字段名、校验信息、风险提示，中英各一份。
4. **生成测试**：`scripts/test-ai-action-standard.ts` 的 `SAMPLES` 加一行完整样例。脱敏、缺参、取消、只执行一次、二次确认、审计条数、失败路径、无会话、找不到目标、每个 check 都会自动生成。
5. **界面 E2E 配置表**：`scripts/e2e-ai-table.mjs` 的 `AI_E2E_TABLE` 加一行（`action`、`required`、`sample`、风险动作的 `risky`、`normal[]`、`error[]`），并在框架里写对应的正常和异常场景（真点确认、读回真实结果）。缺参、取消、二次确认场景由配置表生成。必填下拉不写默认值，卡片显示「请选择」并标红；有合理默认值的字段必须在配置里写 `def`。
6. **评测用例**：`scripts/eval/eval-cases.json` 中英各约 2 句；留出集 `eval-cases-heldout.json` 加 1 句泛化。

## 自动把关（缺一项就失败）
- `test-ai-action-standard`：命令已在 App 注册；args、target、checks 字段都存在；配置表行与 ActionDef 一致（必填数、风险、样例完整）。
- `screenshot-key-screens --ai-table`：动作没有配置表行，或配置表引用的场景不存在，直接以退出码 4 退出。
- 新的硬检查要用 `--probe-fail` 故意失败一次。

## 执行顺序（不要改）
未注册命令 → 会话 → 目标解析 → checks → 命令执行 → 审计（失败时详情追加 ` · 错误信息`）。
