from pathlib import Path

p = Path('src/renderer/src/components/AIPanel.tsx')
t = p.read_text(encoding='utf-8')

# Extend detail type in onShot and stash list
old_list = """        detail?.op === 'aiError' ||
        detail?.op === 'aiAccentStack'
      ) {
        ;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
      }"""
new_list = """        detail?.op === 'aiError' ||
        detail?.op === 'aiAccentStack' ||
        detail?.op === 'aiAskProgress' ||
        detail?.op === 'aiBatchSticky'
      ) {
        ;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
      }"""
if "detail?.op === 'aiAskProgress'" not in t:
    if old_list not in t:
        raise SystemExit('stash list not found')
    t = t.replace(old_list, new_list, 1)

# Insert handlers before aiComposerPop / after aiAccentStack
old_accent_end = """      if (detail?.op === 'aiAccentStack') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(true)
        setLines([
          { role: 'user', content: '对比流式 / 取消 / 错误三种卡片左边条' },
          { role: 'assistant', content: '正在生成排查步骤…', streaming: true },
          { role: 'assistant', content: '已停止的半成品回复', cancelled: true },
          {
            role: 'assistant',
            content: '请求失败：上游超时。',
            variant: 'error',
            errorCode: 'http_504'
          }
        ])
        return
      }
      if (detail?.op !== 'aiComposerPop') {"""

new_accent_end = """      if (detail?.op === 'aiAccentStack') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(true)
        setLines([
          { role: 'user', content: '对比流式 / 取消 / 错误三种卡片左边条' },
          { role: 'assistant', content: '正在生成排查步骤…', streaming: true },
          { role: 'assistant', content: '已停止的半成品回复', cancelled: true },
          {
            role: 'assistant',
            content: '请求失败：上游超时。',
            variant: 'error',
            errorCode: 'http_504'
          }
        ])
        return
      }
      if (detail?.op === 'aiAskProgress') {
        // R17: ask policy + composer run-steps + active plan badge on pending card
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setBusy(true)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'ask', safetyTier: 'confirm' }))
        const step = typeof (detail as { step?: number }).step === 'number' ? (detail as { step?: number }).step! : 2
        const max = typeof (detail as { max?: number }).max === 'number' ? (detail as { max?: number }).max! : 10
        const preview =
          typeof (detail as { preview?: string }).preview === 'string' && (detail as { preview?: string }).preview!.trim()
            ? (detail as { preview?: string }).preview!.trim()
            : 'systemctl status nginx --no-pager'
        setRunProgress({ step, max, policy: 'ask' })
        setPendingConfirm({ requestId: 'shot-r17-ask', action: 'command' })
        setPendingPreviewHold(preview)
        setLines([
          { role: 'user', content: '生产机 nginx 502，按步骤确认执行' },
          {
            role: 'assistant',
            content: preview,
            requestId: 'shot-r17-ask',
            fresh: true,
            structured: {
              action: 'command',
              description: '查看 nginx 状态（当前规划步骤，需确认）。',
              command: preview,
              riskLevel: 'low'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiBatchSticky') {
        // R17: >=2 suggestion commands → sticky batch bar near first suggestion
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setRunProgress(null)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'suggest', safetyTier: 'confirm' }))
        setLines([
          { role: 'user', content: '给我两步只读排查命令，方便批量填入' },
          {
            role: 'assistant',
            content: '查看磁盘占用。',
            fresh: true,
            safetyMode: 'suggest',
            structured: {
              action: 'command',
              description: '查看磁盘占用（只读）。',
              command: 'df -h',
              riskLevel: 'low'
            }
          },
          {
            role: 'assistant',
            content: '查看内存占用最高的进程。',
            fresh: true,
            safetyMode: 'suggest',
            structured: {
              action: 'command',
              description: '按内存占用列出前 10 个进程（只读）。',
              command: 'ps aux --sort=-%mem | head -n 11',
              riskLevel: 'low'
            }
          }
        ])
        return
      }
      if (detail?.op !== 'aiComposerPop') {"""

if "detail?.op === 'aiAskProgress'" not in t or 'shot-r17-ask' not in t:
    if old_accent_end not in t:
        raise SystemExit('aiAccentStack handler end not found')
    t = t.replace(old_accent_end, new_accent_end, 1)

p.write_text(t, encoding='utf-8')
print('AIPanel R17 shots ok')
