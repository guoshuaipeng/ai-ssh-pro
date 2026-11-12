from pathlib import Path
i18n = Path("src/renderer/src/lib/i18n.tsx").read_text(encoding="utf-8")
# setLocale implementation and storage key
i = i18n.find("const setLocale = useCallback")
print(i18n[i:i+500])
print("====persist====")
for line in i18n.splitlines():
    if "localStorage" in line or "aiss.locale" in line or "LOCALE" in line or "normalizeLocale" in line:
        print(line.strip()[:140])

# App screenshot handler - can we add locale op near theme?
app = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
i = app.find("detail.op === 'theme'")
print("====theme op====")
print(app[i:i+350])
