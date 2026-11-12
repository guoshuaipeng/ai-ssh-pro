from pathlib import Path
p = Path(r"src/renderer/src/components/AIPanel.tsx")
lines = p.read_text(encoding="utf-8").splitlines()
# find ExecReplay usage and focusPendingToken
for i,l in enumerate(lines):
    if "ExecReplay" in l or "focusPendingToken" in l or "setFocusPending" in l or "onRetryWithEvidence" in l:
        print(f"{i+1}|{l}")
