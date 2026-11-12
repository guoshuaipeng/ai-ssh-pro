# -*- coding: utf-8 -*-
from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
panel = panel_path.read_text(encoding="utf-8")
if "Round 33: calm miss toast" in panel:
    print("already")
else:
    marker = "      if (detail?.op === 'aiReadonlyBanner') {"
    idx = panel.find(marker)
    if idx < 0:
        raise SystemExit("marker missing")
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
    panel = panel[:idx] + handler + panel[idx:]
    panel_path.write_text(panel, encoding="utf-8", newline="\n")
    print("handler inserted", panel.count("aiMissToast"))
