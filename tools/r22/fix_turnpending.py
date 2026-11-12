from pathlib import Path
p = Path(r"src/renderer/src/components/AIPanel.tsx")
t = p.read_text(encoding="utf-8")
old = """      if (detail?.op === 'aiFailureEvidence') {
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
"""
new = """      if (detail?.op === 'aiFailureEvidence') {
        // Round 21: pin failure evidence on a reply card (S27 visibility).
        // Round 22: do not call setTurnPending here — it is scoped to the stream handler below.
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(false)
        setPendingConfirm(null)
        setRunProgress(null)
        setMemoryOpen(false)
"""
if old not in t:
    raise SystemExit("aiFailureEvidence block with setTurnPending not found")
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print("fixed setTurnPending in shot handler")
