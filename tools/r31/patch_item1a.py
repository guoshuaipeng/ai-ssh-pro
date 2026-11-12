# -*- coding: utf-8 -*-
"""R31 item1: H08 empty/error narrow screenshot matrix + wrap fixes."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

# --- 1) screenshot-hooks.ts ---
hooks = ROOT / "src/renderer/src/lib/screenshot-hooks.ts"
ht = hooks.read_text(encoding="utf-8")
if "aiEmptyConfig" not in ht:
    needle = '  | { op: "auditFilterEmpty"; host?: string; query?: string; seedDetail?: string }\n'
    insert = (
        '  | { op: "auditFilterEmpty"; host?: string; query?: string; seedDetail?: string }\n'
        '  /** Round 31 H08: force needs_config empty (no API key UI). */\n'
        '  | { op: "aiEmptyConfig" }\n'
        '  /** Round 31 H08: force model-missing banner (key ok, no model). */\n'
        '  | { op: "aiModelMissing"; withProdBanner?: boolean }\n'
    )
    assert needle in ht, "hooks needle missing"
    ht = ht.replace(needle, insert, 1)
    hooks.write_text(ht, encoding="utf-8")
    print("hooks: ok")
else:
    print("hooks: already")

# --- 2) AIPanel.tsx ---
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
pt = panel_path.read_text(encoding="utf-8")

# 2a state for screenshot empty / model-missing
if "screenshotEmptyConfig" not in pt:
    old = "  const [screenshotProtectionOverride, setScreenshotProtectionOverride] = useState<ProtectionLevel | null>(null)"
    new = (
        "  const [screenshotProtectionOverride, setScreenshotProtectionOverride] = useState<ProtectionLevel | null>(null)\n"
        "  /** Round 31: force needs_config empty / model-missing for harness (do not mutate settings). */\n"
        "  const [screenshotEmptyConfig, setScreenshotEmptyConfig] = useState(false)\n"
        "  const [screenshotModelMissing, setScreenshotModelMissing] = useState(false)"
    )
    assert old in pt, "state needle missing"
    pt = pt.replace(old, new, 1)
    print("panel state: ok")
else:
    print("panel state: already")

# 2b extend stash list + detail type loosely via op checks
for op in ("aiEmptyConfig", "aiModelMissing", "aiReadonlyBanner"):
    marker = f"detail?.op === '{op}'"
    if marker not in pt.split(";(window as unknown as { __aissShotAiOp?")[0]:
        # insert into stash if-list before aiFailureEvidence close
        stash_old = "        detail?.op === 'aiFailureEvidence'\n      ) {"
        if op == "aiReadonlyBanner" and "detail?.op === 'aiReadonlyBanner'" in pt:
            # handler exists; add to stash list only
            pass
        if stash_old in pt and f"detail?.op === '{op}'" not in pt[pt.find("detail?.op === 'aiStreaming'"):pt.find(";(window as unknown as { __aissShotAiOp?")]:
            stash_new = (
                "        detail?.op === 'aiFailureEvidence' ||\n"
                "        detail?.op === 'aiEmptyConfig' ||\n"
                "        detail?.op === 'aiModelMissing' ||\n"
                "        detail?.op === 'aiReadonlyBanner'\n"
              "      ) {"
            )
            if "detail?.op === 'aiEmptyConfig'" not in pt[pt.find("detail?.op === 'aiStreaming'"):pt.find("clearShotAiOp")]:
                pt = pt.replace(stash_old, stash_new, 1)
                print("panel stash: ok")
            break
    else:
        print(f"panel stash has {op}")

# Fix stash more carefully
start = pt.find("detail?.op === 'aiStreaming'")
end = pt.find(";(window as unknown as { __aissShotAiOp?")
block = pt[start:end]
if "aiEmptyConfig" not in block:
    stash_old = "        detail?.op === 'aiFailureEvidence'\n      ) {"
    stash_new = (
        "        detail?.op === 'aiFailureEvidence' ||\n"
        "        detail?.op === 'aiEmptyConfig' ||\n"
        "        detail?.op === 'aiModelMissing' ||\n"
        "        detail?.op === 'aiReadonlyBanner'\n"
        "      ) {"
    )
    assert stash_old in pt, "stash_old missing"
    pt = pt.replace(stash_old, stash_new, 1)
    print("panel stash replaced")
else:
    print("panel stash already has aiEmptyConfig")

# 2c clear overrides in existing specialized ops that reset protection — add empty/model clears
# Helper: inject setScreenshotEmptyConfig(false); setScreenshotModelMissing(false) after setScreenshotProtectionOverride(null) in ops that clear protection
# Safer: only add in new handlers + aiChat + aiError + aiProdBanner etc via new handlers.

# 2d Insert handlers before aiError (or after aiSuggestCard)
if "detail?.op === 'aiEmptyConfig'" not in pt or pt.count("detail?.op === 'aiEmptyConfig'") < 2:
    # may appear once in stash; need handler
    handler_marker = "      if (detail?.op === 'aiEmptyConfig') {"
    if handler_marker not in pt:
        insert_before = "      if (detail?.op === 'aiError') {"
        handlers = r'''      if (detail?.op === 'aiEmptyConfig') {
        // H08: needs_config empty — no key UI (harness only)
        screenshotForceKeyRef.current = false
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotEmptyConfig(true)
        setScreenshotModelMissing(false)
        setHasApiKey(false)
        setPendingConfirm(null)
        setBusy(false)
        setLines([])
        setResumeHit(null)
        return
      }
      if (detail?.op === 'aiModelMissing') {
        // H08: key ok but no model — calm strip (+ optional prod banner for conflict QA)
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotEmptyConfig(false)
        setScreenshotModelMissing(true)
        const withProd = (detail as { withProdBanner?: boolean }).withProdBanner === true
        setScreenshotProtectionOverride(withProd ? 'production' : null)
        if (withProd) {
          setSafetySettings((prev) => ({ ...prev, aiPolicy: 'auto', safetyTier: 'confirm' }))
        }
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setLines([])
        setResumeHit(null)
        return
      }
'''
        assert insert_before in pt, "aiError handler missing"
        pt = pt.replace(insert_before, handlers + insert_before, 1)
        print("panel handlers: ok")
    else:
        print("panel handlers: already")
else:
    print("panel handlers count ok-ish")

# Ensure other ops clear the new flags when they set protection / key
# Patch aiChat to clear empty/model overrides
if "setScreenshotEmptyConfig(false)" not in pt[pt.find("if (detail?.op === 'aiChat')"):pt.find("if (detail?.op === 'aiStreaming'")]:
    old_chat = """      if (detail?.op === 'aiChat') {
        screenshotForceKeyRef.current = true
        setHasApiKey(true)
        setPendingConfirm(null)"""
    new_chat = """      if (detail?.op === 'aiChat') {
        screenshotForceKeyRef.current = true
        setScreenshotEmptyConfig(false)
        setScreenshotModelMissing(false)
        setHasApiKey(true)
        setPendingConfirm(null)"""
    if old_chat in pt:
        pt = pt.replace(old_chat, new_chat, 1)
        print("aiChat clear flags: ok")
    else:
        print("WARN aiChat pattern mismatch")

# Clear flags in aiError / aiProdBanner / aiReadonlyBanner / aiEmptyResume beginnings
for label, old in [
    (
        "aiError",
        """      if (detail?.op === 'aiError') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)""",
    ),
    (
        "aiProdBanner",
        """      if (detail?.op === 'aiProdBanner') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride('production')
        setHasApiKey(true)""",
    ),
    (
        "aiReadonlyBanner",
        """      if (detail?.op === 'aiReadonlyBanner') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride('readonly')
        setHasApiKey(true)""",
    ),
    (
        "aiEmptyResume",
        """      if (detail?.op === 'aiEmptyResume') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = true
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)""",
    ),
]:
    if old in pt and "setScreenshotEmptyConfig(false)" not in old:
        new = old.replace(
            "setScreenshotProtectionOverride(",
            "setScreenshotEmptyConfig(false)\n        setScreenshotModelMissing(false)\n        setScreenshotProtectionOverride(",
            1,
        ) if "setScreenshotProtectionOverride" in old else old
        # For cases where we need insert before setHasApiKey when override line differs
        if label in ("aiProdBanner", "aiReadonlyBanner"):
            new = old.replace(
                "setScreenshotProtectionOverride(",
                "setScreenshotEmptyConfig(false)\n        setScreenshotModelMissing(false)\n        setScreenshotProtectionOverride(",
                1,
            )
        elif label in ("aiError", "aiEmptyResume"):
            new = old.replace(
                "setScreenshotProtectionOverride(null)\n        setHasApiKey(true)",
                "setScreenshotProtectionOverride(null)\n        setScreenshotEmptyConfig(false)\n        setScreenshotModelMissing(false)\n        setHasApiKey(true)",
            )
        if new != old and new in pt:
            print(f"{label}: already patched?")
        elif new != old:
            pt = pt.replace(old, new, 1)
            print(f"{label} clear flags: ok")
        else:
            print(f"{label}: no change")

# 2e gate empty + model pick with screenshot overrides
old_gate = "{aiEmptyGate(hasApiKey) === 'needs_config' ? ("
new_gate = "{aiEmptyGate(screenshotEmptyConfig ? false : hasApiKey) === 'needs_config' ? ("
if old_gate in pt and "screenshotEmptyConfig ? false" not in pt:
    pt = pt.replace(old_gate, new_gate, 1)
    print("empty gate: ok")
else:
    print("empty gate:", "already" if "screenshotEmptyConfig ? false" in pt else "MISSING")

old_model = "{aiNeedsModelPick(currentModel, modelList) ? ("
new_model = "{aiNeedsModelPick(screenshotModelMissing ? '' : currentModel, screenshotModelMissing ? [] : modelList) ? ("
if old_model in pt and "screenshotModelMissing ? ''" not in pt:
    pt = pt.replace(old_model, new_model, 1)
    print("model pick: ok")
else:
    print("model pick:", "already" if "screenshotModelMissing ? ''" in pt else "MISSING")

# Also compute needsModelPick once for banner polish (item2) — leave for item2

# Refresh effect: respect screenshotEmptyConfig
old_ready = "        const ready = (p ? hasUsableKey(p.baseURL, p.apiKey) : false) || screenshotForceKeyRef.current\n        setHasApiKey(ready)"
new_ready = (
    "        const ready = screenshotEmptyConfig\n"
    "          ? false\n"
    "          : (p ? hasUsableKey(p.baseURL, p.apiKey) : false) || screenshotForceKeyRef.current\n"
    "        setHasApiKey(ready)"
)
# Problem: screenshotEmptyConfig in effect deps — it's state, effect has []. Better use a ref.
# Switch to ref for empty config force so refresh effect sees it without deps churn.

panel_path.write_text(pt, encoding="utf-8")
print("panel written (pass1)")
