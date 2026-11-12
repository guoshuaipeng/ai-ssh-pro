from pathlib import Path
# Check built renderer contains toast-action and aiMissToast
bundle = None
for p in Path("out/renderer/assets").glob("index-*.js"):
    if p.stat().st_size > 1_000_000:
        bundle = p
        break
print("bundle", bundle)
t = bundle.read_text(encoding="utf-8", errors="ignore")
print("toast-action", "toast-action" in t)
print("aiMissToast", "aiMissToast" in t)
print("calm miss toast", "calm miss toast" in t)
print("新开对话 count", t.count("新开对话"))
