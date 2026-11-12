from pathlib import Path
lines = Path(r"src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8").splitlines()
for i,l in enumerate(lines):
    if "TurnPending" in l or "turnPending" in l or "setBusy(" in l and "useState" in "".join(lines[max(0,i-5):i+1]):
        if "TurnPending" in l or "turnPending" in l:
            print(f"{i+1}|{l}")
print("--- nearby shot handlers that clear pending ---")
for i,l in enumerate(lines):
    if "setPendingConfirm(null)" in l and i < 1100:
        # print surrounding for one of the working handlers
        pass
# show aiStreaming or aiCancelled handler for pattern
for name in ["aiCancelled", "aiStreaming", "aiBusy", "aiProdAuto"]:
    for i,l in enumerate(lines):
        if f"op === '{name}'" in l or f'op === "{name}"' in l or f"op === '{name}'" in l.replace("?",""):
            print("FOUND", name, "at", i+1)
            for j in range(i, min(i+25, len(lines))):
                print(f"{j+1}|{lines[j]}")
            break
