from pathlib import Path
t = Path("src/shared/toast-queue.ts").read_text(encoding="utf-8") if Path("src/shared/toast-queue.ts").exists() else Path("src/shared/toast-queue.tsx").read_text(encoding="utf-8")
print(t[:2000])
print("--- held-out ---")
import os
for root,dirs,files in os.walk("scripts"):
  for f in files:
    if "held" in f.lower() or "h01" in f.lower():
      print(os.path.join(root,f))
