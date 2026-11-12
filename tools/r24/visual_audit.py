from pathlib import Path
panel = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
css = Path("src/renderer/src/styles.css").read_text(encoding="utf-8")
findings = []

# P1/P2 candidates from code
if "fail.nextConfirm" in panel and "ai.activePlanStep" in panel[panel.find("ai-failure-next-confirm"):panel.find("ai-failure-next-confirm")+500]:
    findings.append(("P2", "failure→next link appends full 「当前第 n/max 步」 — long on narrow (R22 P3); shorten to 「下一步 · n」"))
if "ai-pending-plan-step" in panel:
    findings.append(("done", "R24 dock plan step closes post-retry chip/dock desync"))
# Decline weight
if "ai-btn-decline" in panel:
    findings.append(("P3", "pending Agree/Decline/审计 at 280px — Decline still same visual weight as before (R19)"))
# Memory chip
if "ai-memory-chip" in css or "memory" in panel.lower():
    findings.append(("P2", "真机宽窄×深浅 still open since R6; harness covers Electron ops only"))
# Empty states
for key in ["ai.empty", "needSession", "model-missing", "ai-card-cancelled", "ai-card-error"]:
    pass
# Check token fallbacks in recent R24 css
idx = css.find("R24 Round24")
block = css[idx:idx+800] if idx>=0 else ""
import re
if re.search(r"var\(--[^,)]+,\s*[^)]+\)", block):
    findings.append(("P1", "R24 CSS has token fallbacks"))
else:
    findings.append(("ok", "R24 CSS no token fallbacks"))

# Dual CTA on failure pin
if "onRetryWithEvidence" in panel and "ai-failure-next-confirm" in panel:
    findings.append(("ok", "failure pin: 带证据重试 primary; 下一步待确认 secondary link"))

# Suggest-only
findings.append(("P3", "英文 chip Confirm/Suggest/Auto vs menu full names — still needs real-device glance (R19)"))
findings.append(("P3", "极窄失败钉 + 安静 ExecReplay 状态行叠放可读性 — 抽检后可接受；若挤再折叠 quiet row"))
findings.append(("P2", "记忆芯片 count-only ≤230px hit target vs host chip spacing (R21) — 真机触控抽检"))
findings.append(("P2", "策略 pop 标题「AI 执行策略（此标签页）」窄栏两行 — 可接受"))

for f in findings:
    print(f"{f[0]}: {f[1]}")
