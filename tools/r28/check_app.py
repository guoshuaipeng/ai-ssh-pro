from pathlib import Path
t = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
i = t.find("detail.op === 'auditFilterEmpty'")
print("idx", i)
print(t[i - 120 : i + 700])
j = t.find("window.addEventListener(SCREENSHOT_EVENT", i)
print("--- listener ---")
print(t[j : j + 350])
print("appendAudit import", "appendAudit" in t[:4000] or "appendAudit," in t)
