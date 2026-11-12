import subprocess
from pathlib import Path
p = subprocess.check_output(["git","show","HEAD:src/renderer/src/components/AIPanel.tsx"], text=True, encoding="utf-8")
for s in ["protection === 'production'", "protectionForUi === 'production'", "elevated && protection ===", "elevated && protectionForUi ==="]:
    print(repr(s), p.count(s))
t = subprocess.check_output(["git","show","HEAD:scripts/test-prod-auto-hint.ts"], text=True, encoding="utf-8")
for line in t.splitlines():
    if "protection" in line and "assert" in line:
        print("TEST:", line.strip())
