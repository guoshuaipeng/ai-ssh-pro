# -*- coding: utf-8 -*-
"""R18 item2: AIPanel shot handlers + audit-focus class binding."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
path = ROOT / "src" / "renderer" / "src" / "components" / "AIPanel.tsx"
text = path.read_text(encoding="utf-8")

# 1) stash list
old_stash = """        detail?.op === 'aiAskProgress' ||
        detail?.op === 'aiBatchSticky'
      ) {
        ;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
      }"""
new_stash = """        detail?.op === 'aiAskProgress' ||
        detail?.op === 'aiBatchSticky' ||
        detail?.op === 'aiPlanStepAlign' ||
        detail?.op === 'aiExecAuditLink' ||
        detail?.op === 'aiAuditFocus'
      ) {
        ;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
      }"""
if old_stash not in text:
    raise SystemExit("stash list missing")
text = text.replace(old_stash, new_stash, 1)

# 2) screenshotAuditFocus state near screenshotProtectionOverride
if "screenshotAuditFocusId" not in text:
    old_state = """  /** Round 14: screenshot-only protection override for prod banner (hooks on). */
  const [screenshotProtectionOverride, setScreenshotProtectionOverride] = useState<ProtectionLevel | null>(null)
"""
    new_state = """  /** Round 14: screenshot-only protection override for prod banner (hooks on). */
  const [screenshotProtectionOverride, setScreenshotProtectionOverride] = useState<ProtectionLevel | null>(null)
  /** Round 18: screenshot-only audit→AI focus id (keeps is-audit-focus for harness). */
  const [screenshotAuditFocusId, setScreenshotAuditFocusId] = useState<string | null>(null)
"""
    if old_state not in text:
        raise SystemExit("screenshot state anchor missing")
    text = text.replace(old_state, new_state, 1)

# 3) handlers after aiBatchSticky block
handlers = r'''
      if (detail?.op === 'aiPlanStepAlign') {
        // R18: agent loop says 7, but confirmable card is suggestion step 2 — chip/badge must show 2
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(true)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'ask', safetyTier: 'confirm' }))
        const runStep = typeof (detail as { runStep?: number }).runStep === 'number' ? (detail as { runStep?: number }).runStep! : 7
        const max = typeof (detail as { max?: number }).max === 'number' ? (detail as { max?: number }).max! : 10
        setRunProgress({ step: runStep, max, policy: 'ask' })
        setPendingConfirm({ requestId: 'shot-r18-align', action: 'command' })
        setPendingPreviewHold('free -m')
        setLines([
          { role: 'user', content: '两步只读排查：磁盘与内存' },
          {
            role: 'assistant',
            content: 'df -h',
            decision: 'agreed',
            fresh: true,
            structured: {
              action: 'command',
              description: '查看磁盘占用（已确认执行）。',
              command: 'df -h',
              riskLevel: 'low'
            }
          },
          {
            role: 'assistant',
            content: 'free -m',
            requestId: 'shot-r18-align',
            fresh: true,
            structured: {
              action: 'command',
              description: '查看内存（当前规划步骤，需确认）。',
              command: 'free -m',
              riskLevel: 'low'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiExecAuditLink') {
        // R18: ExecReplay with jump-to-audit (AI → 审计)
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setRunProgress(null)
        setLines([
          { role: 'user', content: '看看内存最高的进程' },
          {
            role: 'assistant',
            content: 'ps aux --sort=-%mem | head -n 11',
            decision: 'agreed',
            fresh: true,
            structured: {
              action: 'command',
              description: '按内存占用列出前 10 个进程（只读）。',
              command: 'ps aux --sort=-%mem | head -n 11',
              riskLevel: 'low'
            },
            exec: {
              status: 'ok',
              exitCode: 0,
              at: Date.UTC(2026, 9, 20, 6, 12, 41),
              durationMs: 1240,
              outputLines: 11,
              auditId: 'aud-r18-link',
              summary: 'root 20517 2.1 7.5 containerd\napp 26383 1.4 4.8 java -jar app.jar'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiAuditFocus') {
        // R18: card highlighted as if jumped from audit row (审计 → 对话)
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setRunProgress(null)
        const auditId =
          typeof (detail as { auditId?: string }).auditId === 'string' && (detail as { auditId?: string }).auditId!.trim()
            ? (detail as { auditId?: string }).auditId!.trim()
            : 'aud-r18-focus'
        const cmd =
          typeof (detail as { command?: string }).command === 'string' && (detail as { command?: string }).command!.trim()
            ? (detail as { command?: string }).command!.trim()
            : 'ps aux --sort=-%mem | head -n 11'
        setScreenshotAuditFocusId(auditId)
        setLines([
          { role: 'user', content: '从审计跳回这一步' },
          {
            role: 'assistant',
            content: cmd,
            decision: 'agreed',
            fresh: true,
            structured: {
              action: 'command',
              description: '审计回跳高亮：对应已执行命令卡片。',
              command: cmd,
              riskLevel: 'low'
            },
            exec: {
              status: 'ok',
              exitCode: 0,
              at: Date.UTC(2026, 9, 20, 6, 12, 41),
              durationMs: 980,
              outputLines: 11,
              auditId,
              summary: 'root 20517 2.1 7.5 containerd'
            }
          }
        ])
        return
      }
'''

anchor = "      if (detail?.op === 'aiBatchSticky') {"
# find end of aiBatchSticky block - the `return\n      }\n      if (detail?.op !== 'aiComposerPop')`
end_marker = """        ])
        return
      }
      if (detail?.op !== 'aiComposerPop') {
"""
# Need unique context - use aiBatchSticky's free -m ending... actually batch sticky ends with head -n 11
idx = text.find("      if (detail?.op === 'aiBatchSticky') {")
if idx < 0:
    raise SystemExit("aiBatchSticky not found")
end_idx = text.find(end_marker, idx)
if end_idx < 0:
    raise SystemExit("aiBatchSticky end not found")
# insert after the closing of aiBatchSticky (after `return\n      }\n`)
insert_at = end_idx + len("        ])\n        return\n      }\n")
if "aiPlanStepAlign" not in text[idx:idx+2500]:
    text = text[:insert_at] + handlers + text[insert_at:]
else:
    print("handlers already present?")

# 4) bind is-audit-focus on structured cards via screenshotAuditFocusId
# The command card className:
old_cls = """                className={`msg assistant ai-structured ai-dark-card${isConfirmable ? ' is-active-plan-step' : ''}`}
                data-testid="ai-reply-card"
                data-card={card}
                data-confirm-id={l.requestId || undefined}
                data-active-plan={isConfirmable ? '1' : undefined}
                data-exec-audit-id={l.exec?.auditId || undefined}
                data-exec-command={s.command || undefined}
              >"""
new_cls = """                className={`msg assistant ai-structured ai-dark-card${isConfirmable ? ' is-active-plan-step' : ''}${screenshotAuditFocusId && l.exec?.auditId === screenshotAuditFocusId ? ' is-audit-focus' : ''}`}
                data-testid="ai-reply-card"
                data-card={card}
                data-confirm-id={l.requestId || undefined}
                data-active-plan={isConfirmable ? '1' : undefined}
                data-exec-audit-id={l.exec?.auditId || undefined}
                data-exec-command={s.command || undefined}
                data-audit-focus={screenshotAuditFocusId && l.exec?.auditId === screenshotAuditFocusId ? '1' : undefined}
              >"""
if old_cls not in text:
    raise SystemExit("card className block not found")
text = text.replace(old_cls, new_cls, 1)

# Clear focus id on aiChat empty reset paths that already clear other shot state — optional.
# When aiAskProgress / others run, clear focus:
for op_clear in ["aiAskProgress", "aiBatchSticky"]:
    pass

# Patch aiAskProgress / aiBatchSticky / aiPlan already setScreenshotAuditFocusId in new handlers.
# Also clear on older handlers that setScreenshotProtectionOverride(null):
text2 = text.replace(
    """      if (detail?.op === 'aiAskProgress') {
        // R17: ask policy + composer run-steps + active plan badge on pending card
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
""",
    """      if (detail?.op === 'aiAskProgress') {
        // R17: ask policy + composer run-steps + active plan badge on pending card
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
""",
    1,
)
text = text2
text = text.replace(
    """      if (detail?.op === 'aiBatchSticky') {
        // R17: >=2 suggestion commands → sticky batch bar near first suggestion
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
""",
    """      if (detail?.op === 'aiBatchSticky') {
        // R17: >=2 suggestion commands → sticky batch bar near first suggestion
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
""",
    1,
)

path.write_text(text, encoding="utf-8")
print("AIPanel shot handlers patched")
