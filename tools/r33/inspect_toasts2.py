from pathlib import Path
har = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
i = har.find("s.toasts")
print("count", har.count("s.toasts"))
print(har[i-200:i+250])
# example shot with toasts
i = har.find("toasts: true")
print("====example====")
print(har[i-150:i+400])
