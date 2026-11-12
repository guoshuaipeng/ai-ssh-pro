# -*- coding: utf-8 -*-
from pathlib import Path

panel = Path(r"E:\pythonProjects\ai-ssh-pro\src\renderer\src\components\AIPanel.tsx")
pt = panel.read_text(encoding="utf-8")

# Add to early op allowlist near aiMemoryEvidence
old_allow = "        detail?.op === 'aiMemoryEvidence'"
new_allow = "        detail?.op === 'aiMemoryEvidence' ||\n        detail?.op === 'aiFailureEvidence'"
if "detail?.op === 'aiFailureEvidence'" not in pt.split("if (detail?.op === 'aiFailureEvidence')")[0]:
    # only in the allowlist at top of handler
    idx = pt.find("detail?.op === 'aiMemoryEvidence'")
    if idx < 0:
        raise SystemExit('allowlist marker missing')
    # check surrounding - if already has aiFailureEvidence nearby skip
    window = pt[idx:idx+120]
    if "aiFailureEvidence" not in window:
        pt = pt.replace(old_allow, new_allow, 1)

old_shot = """      if (detail?.op === 'aiFailureEvidence') {
        // Round 21: pin failure evidence on a reply card (S27 visibility).
        setBusy(false)
        setTurnPending(null)
        setPendingConfirm(null)
        setRunProgress(null)
        setMemoryOpen(false)
        const evidence =
          'command=echo S27_FAIL_CMD\\nexit=1\\nS27_STDERR_EVIDENCE\\nS27_TIMEOUT_STUB'
        setLines([
          { role: 'user', content: '请执行 echo S27_FAIL_CMD。确认后再发。' },
          {
            role: 'assistant',
            content: '提议执行 echo S27_FAIL_CMD，等待确认。',
            structured: {
              description: '提议执行 echo S27_FAIL_CMD，等待确认。',
              action: 'command',
              command: 'echo S27_FAIL_CMD',
              riskLevel: 'low',
              completed: false
            },
            requestId: 'shot-r21-fail',
            decision: 'agreed',
            fresh: false,
            exec: {
              status: 'failed',
              at: Date.now() - 1200,
              durationMs: 420,
              exitCode: 1,
              summary: 'S27_STDERR_EVIDENCE',
              outputLines: 1,
              failureKind: 'nonzero',
              evidence,
              retryBudget: { count: 1, cap: 2, exhausted: false }
            }
          }
        ])
        return
      }
"""
# File has real \n in string - match what's actually there
start = pt.find("      if (detail?.op === 'aiFailureEvidence') {")
if start < 0:
    raise SystemExit('shot block missing')
end = pt.find("      if (detail?.op === 'aiMemoryEvidence') {", start)
if end < 0:
    raise SystemExit('memory block after failure missing')

new_shot = """      if (detail?.op === 'aiFailureEvidence') {
        // Round 21: pin failure evidence on a reply card (S27 visibility).
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(false)
        setTurnPending(null)
        setPendingConfirm(null)
        setRunProgress(null)
        setMemoryOpen(false)
        const evidence =
          'command=echo S27_FAIL_CMD\\nexit=1\\nS27_STDERR_EVIDENCE\\nS27_TIMEOUT_STUB'
        setLines([
          { role: 'user', content: '请执行 echo S27_FAIL_CMD。确认后再发。' },
          {
            role: 'assistant',
            content: '提议执行 echo S27_FAIL_CMD，等待确认。',
            structured: {
              description: '提议执行 echo S27_FAIL_CMD，等待确认。',
              action: 'command',
              command: 'echo S27_FAIL_CMD',
              riskLevel: 'low',
              completed: false
            },
            requestId: 'shot-r21-fail',
            decision: 'agreed',
            fresh: false,
            exec: {
              status: 'failed',
              at: Date.now() - 1200,
              durationMs: 420,
              exitCode: 1,
              summary: 'S27_STDERR_EVIDENCE',
              outputLines: 1,
              failureKind: 'nonzero',
              evidence,
              retryBudget: { count: 1, cap: 2, exhausted: false }
            }
          }
        ])
        return
      }
"""
new_shot = new_shot.replace("\\\\n", "\\n")
pt = pt[:start] + new_shot + pt[end:]
panel.write_text(pt, encoding="utf-8")
print("shot block fixed")

# screenshot-hooks
hooks = Path(r"E:\pythonProjects\ai-ssh-pro\src\renderer\src\lib\screenshot-hooks.ts")
ht = hooks.read_text(encoding="utf-8")
if 'aiFailureEvidence' not in ht:
    ht = ht.replace(
        '  | { op: "aiMemoryEvidence"; goal?: string; hostFacts?: string[]; observations?: string[]; recentCommands?: string[] }\n',
        '  | { op: "aiMemoryEvidence"; goal?: string; hostFacts?: string[]; observations?: string[]; recentCommands?: string[] }\n'
        '  /** Round 21: failed command evidence pin (S27). */\n'
        '  | { op: "aiFailureEvidence" }\n',
        1,
    )
    hooks.write_text(ht, encoding="utf-8")
    print("hooks updated")
else:
    print("hooks already")
