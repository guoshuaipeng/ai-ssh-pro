from pathlib import Path
import json

# unmaximize permission
cap_path = Path("src-tauri/capabilities/default.json")
cap = json.loads(cap_path.read_text(encoding="utf-8"))
for p in ["core:window:allow-unmaximize", "core:window:allow-on-resized"]:
    # on-resized might not exist as permission - skip if not needed (listen uses event)
    if p.startswith("core:window:allow-on"):
        continue
    if p not in cap["permissions"]:
        cap["permissions"].append(p)
cap_path.write_text(json.dumps(cap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("caps", [x for x in cap["permissions"] if "window" in x])

# Harden App.tsx setSessionProtection / parseSshForm call sites
app = Path("src/renderer/src/App.tsx")
at = app.read_text(encoding="utf-8")
# setSessionProtection usage around 3567
old1 = "const push = window.aiss.ai.setSessionProtection"
if old1 in at and "typeof window.aiss.ai.setSessionProtection" not in at:
    # read context
    i = at.find(old1)
    print("setSessionProtection context:\n", at[i-80:i+200])

# Harden AIPanel confirmStep
ap = Path("src/renderer/src/components/AIPanel.tsx")
apt = ap.read_text(encoding="utf-8")
oldc = "await window.aiss.ai.confirmStep(requestId, ok)"
if oldc in apt:
    apt = apt.replace(
        oldc,
        "const step = window.aiss?.ai?.confirmStep ?? window.aiss?.ai?.resolveConfirm\n"
        "    if (typeof step !== 'function') return\n"
        "    await step(requestId, ok)",
        1,
    )
    ap.write_text(apt, encoding="utf-8")
    print("confirmStep hardened")
else:
    print("confirmStep already hardened or missing")

# App setSessionProtection - make safe
import re
# Find the block
m = re.search(r"const push = window\.aiss\.ai\.setSessionProtection\n.*?\n.*?(push\([^)]*\))", at, re.S)
# simpler line-based
if "const push = window.aiss.ai.setSessionProtection" in at:
    at2 = at.replace(
        "const push = window.aiss.ai.setSessionProtection",
        "const push = window.aiss?.ai?.setSessionProtection",
        1,
    )
    # ensure call checks
    at2 = at2.replace(
        "const push = window.aiss?.ai?.setSessionProtection\n",
        "const push = window.aiss?.ai?.setSessionProtection\n    if (typeof push !== 'function') return\n",
        1,
    )
    # might already have different structure - check
    if at2 != at:
        app.write_text(at2, encoding="utf-8")
        print("setSessionProtection hardened")
    else:
        print("setSessionProtection no change")

# parseSshForm
if "window.aiss.ai.parseSshForm" in at2 if 'at2' in dir() else at:
    src = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
    src = src.replace(
        "const p = await window.aiss.ai.parseSshForm(blob)",
        "const parseForm = window.aiss?.ai?.parseSshForm ?? window.aiss?.ai?.parseSsh\n"
        "      if (typeof parseForm !== 'function') return\n"
        "      const p = await parseForm(blob)",
        1,
    )
    Path("src/renderer/src/App.tsx").write_text(src, encoding="utf-8")
    print("parseSshForm hardened")
