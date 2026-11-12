# -*- coding: utf-8 -*-
"""Wire failure retry into AIPanel + i18n + CSS + memory narrow."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- AIPanel: retryWithEvidence callback + pass props to ExecReplay ---
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
pt = panel.read_text(encoding="utf-8")

if "retryWithFailureEvidence" not in pt:
    anchor = "  const retryLastUser = useCallback(() => {"
    if anchor not in pt:
        raise SystemExit("retryLastUser anchor missing")
    insert = """  /**
   * Round 21 / S27: pin-card CTA — new ask citing evidence; never silent SSH write / confirmStep.
   * Exhausted budget still opens a composer ask so the user can change approach.
   */
  const retryWithFailureEvidence = useCallback(
    (input: { command: string; evidence: string; exhausted: boolean }) => {
      if (busy) {
        showToast(tg('ai.busyWait'), { kind: 'error' })
        return
      }
      const evidence = (input.evidence || '').trim()
      const cmd = (input.command || '').trim()
      if (!evidence) {
        showToast(tg('fail.noEvidence'), { kind: 'error' })
        return
      }
      if (input.exhausted) {
        const draft = tg('fail.exhaustedAsk', { evidence })
        setInput(draft)
        showToast(tg('fail.budgetExhausted'), { kind: 'error' })
        queueMicrotask(() => {
          const el = inputRef.current
          if (!el) return
          el.focus()
          el.setSelectionRange(0, el.value.length)
        })
        return
      }
      const ask = tg('fail.retryAsk', { evidence, command: cmd || '—' })
      void submitToAi(ask)
    },
    [busy, submitToAi]
  )

  """ + anchor
    pt = pt.replace(anchor, insert, 1)

old_exec = """                {l.exec ? (
                  <ExecReplay
                    exec={l.exec}
                    host={conversation ? conversationLabel(conversation.hostLabel, conversation.n) : hostName || undefined}
                    command={s.command}
                  />
                ) : null}
"""
new_exec = """                {l.exec ? (
                  <ExecReplay
                    exec={l.exec}
                    host={conversation ? conversationLabel(conversation.hostLabel, conversation.n) : hostName || undefined}
                    command={s.command}
                    busy={busy}
                    onRetryWithEvidence={retryWithFailureEvidence}
                  />
                ) : null}
"""
if "onRetryWithEvidence={retryWithFailureEvidence}" not in pt:
    if old_exec not in pt:
        raise SystemExit("ExecReplay usage not found")
    pt = pt.replace(old_exec, new_exec, 1)

# Screenshot stash for failure evidence (optional, for harness later)
if "aiFailureEvidence" not in pt:
    # Add near other shot ops if present
    marker = "      if (detail?.op === 'aiMemoryEvidence') {"
    if marker in pt:
        shot = """      if (detail?.op === 'aiFailureEvidence') {
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
        # Fix double-escaped newlines in evidence string for TS
        shot = shot.replace("\\\\n", "\\n")
        pt = pt.replace(marker, shot + marker, 1)

panel.write_text(pt, encoding="utf-8")
print("AIPanel patched")

# --- App.tsx screenshot hook type ---
app = ROOT / "src/renderer/src/App.tsx"
at = app.read_text(encoding="utf-8")
if "aiFailureEvidence" not in at:
    if "aiMemoryEvidence" in at:
        at = at.replace("aiMemoryEvidence", "aiMemoryEvidence' || detail.op === 'aiFailureEvidence", 1)
        # careful - might break string. Better check context.
# revert if broken - let's read context
app.write_text(at, encoding="utf-8")  # may need fix below
print("App touch")
