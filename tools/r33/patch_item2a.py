# -*- coding: utf-8 -*-
"""R33 item2: locale + aiMissToast ops, shot matrix, harness, tests, package wire."""
from pathlib import Path
import re

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# ---- screenshot-hooks.ts ----
hooks = ROOT / "src/renderer/src/lib/screenshot-hooks.ts"
ht = hooks.read_text(encoding="utf-8")
if '| { op: "aiMissToast"' not in ht and "| { op: 'aiMissToast'" not in ht:
    # insert after aiReadonlyBanner
    needle = '  | { op: "aiReadonlyBanner" }\n'
    insert = needle + '  /** Round 33: show audit→AI miss toast (New chat action). */\n  | { op: "aiMissToast" }\n  /** Round 33: force UI locale for EN chip matrix. */\n  | { op: "locale"; id: "en" | "zh-CN" }\n'
    if needle not in ht:
        raise SystemExit("aiReadonlyBanner type not found")
    ht = ht.replace(needle, insert, 1)
    hooks.write_text(ht, encoding="utf-8", newline="\n")
    print("hooks types ok")
else:
    print("hooks types already")

# ---- App.tsx: locale op + include aiMissToast in AI forward list ----
app_path = ROOT / "src/renderer/src/App.tsx"
app = app_path.read_text(encoding="utf-8")

if "detail.op === 'locale'" not in app:
    theme_block = "      if (detail.op === 'theme') {\n        applyUiTheme(detail.id as UiThemeId)\n        return\n      }"
    locale_block = theme_block + """
      if (detail.op === 'locale') {
        const id = (detail as { id?: string }).id === 'en' ? 'en' : 'zh-CN'
        setLocale(id)
        return
      }"""
    if theme_block not in app:
        raise SystemExit("theme op block not found in App")
    app = app.replace(theme_block, locale_block, 1)
    print("App locale op ok")
else:
    print("App locale already")

# add aiMissToast to the AI ops forward list
if "detail.op === 'aiMissToast'" not in app:
    old = "detail.op === 'aiEmptyConfig' || detail.op === 'aiModelMissing' ||\n        detail.op === 'aiReadonlyBanner'"
    new = "detail.op === 'aiEmptyConfig' || detail.op === 'aiModelMissing' ||\n        detail.op === 'aiReadonlyBanner' || detail.op === 'aiMissToast'"
    if old not in app:
        raise SystemExit("App AI ops list anchor not found")
    app = app.replace(old, new, 1)
    print("App aiMissToast forward ok")
else:
    print("App aiMissToast forward already")

app_path.write_text(app, encoding="utf-8", newline="\n")

# ---- AIPanel.tsx: handle aiMissToast + list in __aissShotAiOp gate ----
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
panel = panel_path.read_text(encoding="utf-8")

# gate list
if "aiMissToast" not in panel.split("detail?.op === 'aiReadonlyBanner'")[0][-500:] and "detail?.op === 'aiMissToast'" not in panel:
    # add to the early remember-op list
    old = "detail?.op === 'aiEmptyConfig' ||\n        detail?.op === 'aiModelMissing' ||\n        detail?.op === 'aiReadonlyBanner'"
    new = "detail?.op === 'aiEmptyConfig' ||\n        detail?.op === 'aiModelMissing' ||\n        detail?.op === 'aiReadonlyBanner' ||\n        detail?.op === 'aiMissToast'"
    if old not in panel:
        # try single-line variants from earlier search
        old2 = "detail?.op === 'aiReadonlyBanner'\n      ) {"
        if old2 in panel:
            panel = panel.replace(old2, "detail?.op === 'aiReadonlyBanner' ||\n        detail?.op === 'aiMissToast'\n      ) {", 1)
            print("panel gate via readonly")
        else:
            raise SystemExit("panel gate list not found")
    else:
        panel = panel.replace(old, new, 1)
        print("panel gate ok")
else:
    print("panel gate check pass/already")

# handler after aiReadonlyBanner block — find end of aiReadonlyBanner handler's return
if "detail?.op === 'aiMissToast'" not in panel or panel.count("aiMissToast") < 2:
    # Find a good insertion point: after aiReadonlyBanner handler
    marker = "if (detail?.op === 'aiReadonlyBanner') {"
    idx = panel.find(marker)
    if idx < 0:
        raise SystemExit("aiReadonlyBanner handler missing")
    # find matching close of this if by scanning for next "if (detail?.op ===" at same indent after a return
    # simpler: insert BEFORE aiReadonlyBanner handler
    handler = '''      if (detail?.op === 'aiMissToast') {
        // Round 33: calm miss toast with New chat action (visual audit matrix).
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotEmptyConfig(false)
        screenshotEmptyConfigRef.current = false
        setScreenshotModelMissing(false)
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setLines([
          { role: 'user', content: '从审计跳回这一步' },
          {
            role: 'assistant',
            content: '当前对话里另有步骤；审计指向的那条不在这里。',
            fresh: false,
            structured: {
              action: 'end',
              description: '当前对话里另有步骤；审计指向的那条不在这里。',
              riskLevel: 'low'
            }
          }
        ])
        const miss = buildAuditOpenAiMissToast()
        showToast(tg(miss.messageKey), {
          kind: miss.kind,
          theme: miss.theme,
          ms: miss.ms,
          action: {
            label: tg(miss.actionKey),
            run: () => {
              startNewChatRef.current?.()
            }
          }
        })
        return
      }
'''
    if "detail?.op === 'aiMissToast'" in panel:
        print("handler string present")
    else:
        panel = panel[:idx] + handler + panel[idx:]
        print("panel aiMissToast handler inserted")
else:
    print("panel handler already")

panel_path.write_text(panel, encoding="utf-8", newline="\n")
print("panel written")
