from pathlib import Path
# how locale / toast shot hooks work
hooks = Path("src/renderer/src/lib/screenshot-hooks.ts").read_text(encoding="utf-8")
print("HOOKS FILE LEN", len(hooks))
for needle in ["locale", "Locale", "aiMiss", "Toast", "setLocale", "en-", "language"]:
    if needle.lower() in hooks.lower():
        print("found", needle)
# App.tsx screenshot dispatch
app = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
for needle in ["aiEmptyConfig", "aiModelMissing", "aiProdBanner", "locale", "setLocale", "screenshot"]:
    c = app.count(needle)
    if c: print("App", needle, c)
# toast component
for path in Path("src/renderer/src").rglob("*Toast*"):
    print("toast file", path)
# i18n setLocale
i18n = Path("src/renderer/src/lib/i18n.tsx").read_text(encoding="utf-8")
for line in i18n.splitlines():
    if "setLocale" in line or "locale =" in line[:40] or "function setLocale" in line:
        print("i18n:", line.strip()[:120])
