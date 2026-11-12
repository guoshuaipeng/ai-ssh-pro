from pathlib import Path
panel = Path(r"src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
# check alignedPlan definition relative to next-confirm button
idx = panel.find('data-testid="ai-failure-next-confirm"')
print("next-confirm at", panel.count("\n",0,idx)+1)
# find alignedPlan decls
import re
for m in re.finditer(r"alignedPlan", panel):
    line = panel.count("\n",0,m.start())+1
    if line < 2500 or "const aligned" in panel[m.start()-20:m.start()+40]:
        sn = panel[m.start()-30:m.start()+50].replace("\n"," / ")
        if "const " in sn or "alignPlanStepDisplay" in sn or line < 100:
            print("decl?", line, sn)

print("--- setPendingPreviewHold ---")
for m in re.finditer(r"setPendingPreviewHold|pendingPreviewHold", panel):
    line = panel.count("\n",0,m.start())+1
    if line < 600:
        print(line, panel[m.start()-20:m.start()+60].replace("\n"," / "))

print("--- setRunProgress type sample ---")
for m in re.finditer(r"setRunProgress\(", panel):
    line = panel.count("\n",0,m.start())+1
    if line < 1200:
        print(line, panel[m.start():m.start()+80].replace("\n"," / "))
