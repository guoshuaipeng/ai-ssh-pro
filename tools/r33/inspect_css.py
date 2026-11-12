from pathlib import Path
# How App dispatches screenshot ops to AIPanel
app = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
i = app.find("aiEmptyConfig")
print(app[i-400:i+500])
print("====")
# toast host mount
print("ToastHost", "ToastHost" in app)
# features toast wrap?
feat = Path("src/renderer/src/features.css").read_text(encoding="utf-8")
styles = Path("src/renderer/src/styles.css").read_text(encoding="utf-8")
# check if toast message has min-width
for label, css in [("feat", feat), ("styles", styles)]:
    for needle in [".toast span", "toast-msg", "toast-message", ".toast {"]:
        if needle in css:
            print(label, "has", needle)
# chip label ellipsis rules
i = styles.find(".ai-composer-bar .ai-safety-chip .ai-safety-chip-label")
print("====chip label css====")
print(styles[i:i+700])
