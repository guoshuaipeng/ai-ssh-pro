from pathlib import Path
har = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
# how toasts flag is applied and how steps with eval/op run
i = har.find("shot-toasts")
print(har[i-50:i+80])
# find the loop body for steps
i = har.find("for (const st of s.steps")
if i<0: i = har.find("for (const st of")
print("====steps loop====")
print(har[i:i+900])
# r30 map - does it pass toasts?
i = har.find("r30AiShots()")
print("====r30 map====")
print(har[i:i+350])
