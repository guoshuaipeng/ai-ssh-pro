from pathlib import Path

# Prepend Round 17 to backlog
backlog = Path('docs/backlog.md')
bt = backlog.read_text(encoding='utf-8')
r17 = """## 2026-11-05 Round 17 追加
- 已完成：审计行内 **跳回 AI 对话步骤**（`OPEN_AI_FROM_AUDIT_EVENT`；AI 来源 command/ai.action 行「对话」；按 auditId/命令高亮卡片；主机标签尽量切会话）；R14 harness 扩拍 ask 进度 + sticky 批量条 → `docs/screenshots/r17/`（`aiAskProgress` / `aiBatchSticky`）。
- P2：真机宽窄×深浅仍欠（R6–R16 遗留）；审计「对话」在无匹配 turn 时仅 toast——可考虑弱提示「在当前主机新开对话」但不造历史。
- P1 候选 Round 18：保持 AI 对话——计划步与 `suggestionStepNo` 更紧对齐 / 或 composer 策略菜单触控可读（R15 视觉债）/ 或审计↔对话双向深链补截图矩阵；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 17 UX 验收（编码后）
- 主 CTA：审计表筛选/导出仍是主 chrome；行内「对话」次要链接权重（对仗 ExecReplay「审计」）。
- 绑定：host 用写入审计时的 conversationLabel；焦点优先 auditId，其次 command 文本。
- 空/错：无匹配 → 仍开面板 + toast「未在当前对话找到该步骤」；非 AI 行无按钮。
- 矩阵：`docs/screenshots/r17/README.md`（ask-progress / batch-sticky / narrow）。

"""
if '## 2026-11-05 Round 17 追加' not in bt:
    backlog.write_text(r17 + bt, encoding='utf-8')
    print('backlog ok')
else:
    print('backlog already')

# Append retro
retro = Path('docs/retro.md')
rt = retro.read_text(encoding='utf-8')
entry = """
## Round 17 — 2026-11-05（审计→对话回跳 + R17 截图矩阵）
- 计划：约 30 分钟；1 高频：审计行「对话」回跳 AI 步骤（R7 反向）；1 小打磨：扩 R14 harness 拍 ask 进度 + sticky batch。
- 实际：本机完成两项；Core-A 34/34；held-out H01–H08 绿；截图 6 张 expect 全 true。
- 卡住点：Windows 本机无 `rg`、PowerShell 花括号转义；改用 tools/r17 Python 补丁。机器短暂 unreachable 重试即可。
- 根因/预防：双向深链事件对称放在 ExecReplay 旁（`OPEN_AUDIT_EVENT` / `OPEN_AI_FROM_AUDIT_EVENT`）；新 screenshot op 必须同步 App 开面板列表 + AIPanel stash/replay + matrix JSON。
- 验收：`test-ai-jump-from-audit` / `test-r17-ai-shot-harness` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r17/` dark/light × ask-progress / batch-sticky / narrow。
- 提交：`59251dc7`（回跳）、`10b45719`（harness）。

"""
if '## Round 17 — 2026-11-05' not in rt:
    # append at end
    retro.write_text(rt.rstrip() + '\n' + entry, encoding='utf-8')
    print('retro ok')
else:
    print('retro already')
