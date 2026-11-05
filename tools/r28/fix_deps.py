from pathlib import Path
app = Path("src/renderer/src/App.tsx")
t = app.read_text(encoding="utf-8")
old = "  }, [ensureAiVisible, openSftpFromHost, openSftpTransfer, persistSessionState, folders, locale, handleTitlebarMenuAction])"
new = "  }, [ensureAiVisible, openAudit, openSftpFromHost, openSftpTransfer, persistSessionState, folders, locale, handleTitlebarMenuAction])"
# Only replace the screenshot effect deps — find near SCREENSHOT_EVENT
idx = t.find("window.addEventListener(SCREENSHOT_EVENT, onShot)")
assert idx > 0
# deps line follows shortly after
chunk = t[idx : idx + 400]
if "openAudit" not in chunk:
    assert old in t, "deps anchor missing"
    # replace only the occurrence after SCREENSHOT_EVENT
    before, after = t[:idx], t[idx:]
    assert old in after
    after = after.replace(old, new, 1)
    t = before + after
    app.write_text(t, encoding="utf-8")
    print("deps updated")
else:
    print("deps already have openAudit")
