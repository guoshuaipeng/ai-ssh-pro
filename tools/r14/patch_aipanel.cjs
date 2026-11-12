const fs = require('fs');
const path = 'src/renderer/src/components/AIPanel.tsx';
let s = fs.readFileSync(path, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

if (s.includes("detail?.op === 'aiCancelled'")) {
  console.log('AIPanel already patched');
  process.exit(0);
}

// 1) Add screenshotProtectionOverride state near screenshotForceKeyRef
const anchor = `  const screenshotForceKeyRef = useRef(false)`;
if (!s.includes(anchor)) throw new Error('missing screenshotForceKeyRef');
if (!s.includes('screenshotProtectionOverride')) {
  s = s.replace(
    anchor,
    `  const screenshotForceKeyRef = useRef(false)${nl}  /** Round 14: screenshot-only protection override for prod banner (hooks on). */${nl}  const [screenshotProtectionOverride, setScreenshotProtectionOverride] = useState<ProtectionLevel | null>(null)${nl}  /** Round 14: keep D29 resume chip from being cleared by archive list effect. */${nl}  const screenshotResumeLockRef = useRef(false)`
  );
}

// 2) Expand onShot detail type and add handlers after aiStreaming block
const streamEnd = `      if (detail?.op === 'aiStreaming') {
        // H04/H05: real busy + streaming card (partial text + in-card Stop). No DOM inject.
        screenshotForceKeyRef.current = true
        setHasApiKey(true)
        setPendingConfirm(null)
        const partial =
          typeof (detail as { partial?: string }).partial === 'string' && (detail as { partial?: string }).partial!.trim()
            ? (detail as { partial?: string }).partial!.trim()
            : '正在分析 nginx 502…\\n先看 error.log 末尾：'
        setBusy(true)
        setLines([
          { role: 'user', content: 'nginx 502，帮我边生成边停一下看看' },
          { role: 'assistant', content: partial, streaming: true }
        ])
        return
      }`;

if (!s.includes("op === 'aiStreaming'")) throw new Error('aiStreaming block missing');

const extra = `      if (detail?.op === 'aiStreaming') {
        // H04/H05: real busy + streaming card (partial text + in-card Stop). No DOM inject.
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        const partial =
          typeof (detail as { partial?: string }).partial === 'string' && (detail as { partial?: string }).partial!.trim()
            ? (detail as { partial?: string }).partial!.trim()
            : '正在分析 nginx 502…\\n先看 error.log 末尾：'
        setBusy(true)
        setLines([
          { role: 'user', content: 'nginx 502，帮我边生成边停一下看看' },
          { role: 'assistant', content: partial, streaming: true }
        ])
        return
      }
      if (detail?.op === 'aiCancelled') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        const partial =
          typeof (detail as { partial?: string }).partial === 'string' && (detail as { partial?: string }).partial!.trim()
            ? (detail as { partial?: string }).partial!.trim()
            : '正在分析 nginx 502…\\n（已停止，可点重试继续）'
        setLines([
          { role: 'user', content: 'nginx 502，帮我边生成边停一下看看' },
          { role: 'assistant', content: partial, cancelled: true }
        ])
        return
      }
      if (detail?.op === 'aiEmptyResume') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = true
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setLines([])
        const title =
          typeof (detail as { title?: string }).title === 'string' && (detail as { title?: string }).title!.trim()
            ? (detail as { title?: string }).title!.trim()
            : 'nginx 502 排错'
        setResumeHit({
          id: 'shot-r14-resume',
          group: 'demo-host',
          hostLabel: '演示主机',
          key: 'demo-host',
          title,
          savedAt: Date.now() - 120000,
          count: 6
        })
        return
      }
      if (detail?.op === 'aiProdBanner') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride('production')
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'auto', safetyTier: 'confirm' }))
        setLines([
          { role: 'user', content: '生产机上帮我看一下磁盘' },
          {
            role: 'assistant',
            content: '这是生产主机：自动执行仍会跑低/中风险只读命令，高危必须确认。',
            fresh: false,
            structured: {
              action: 'end',
              description: '这是生产主机：自动执行仍会跑低/中风险只读命令，高危必须确认。',
              riskLevel: 'low'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiSuggestCard') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'suggest', safetyTier: 'confirm' }))
        const cmd =
          typeof (detail as { command?: string }).command === 'string' && (detail as { command?: string }).command!.trim()
            ? (detail as { command?: string }).command!.trim()
            : 'systemctl status nginx --no-pager'
        const desc =
          typeof (detail as { description?: string }).description === 'string' &&
          (detail as { description?: string }).description!.trim()
            ? (detail as { description?: string }).description!.trim()
            : '查看 nginx 服务状态（只读）。'
        setLines([
          { role: 'user', content: '仅建议模式下，给我一条可复制的排查命令' },
          {
            role: 'assistant',
            content: desc,
            requestId: 'shot-r14-suggest',
            fresh: true,
            safetyMode: 'suggest',
            structured: { action: 'command', description: desc, command: cmd, riskLevel: 'low' }
          }
        ])
        return
      }
      if (detail?.op === 'aiError') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        const message =
          typeof (detail as { message?: string }).message === 'string' && (detail as { message?: string }).message!.trim()
            ? (detail as { message?: string }).message!.trim()
            : '模型请求失败：请检查 API Key 或网络后重试。'
        const errorCode =
          typeof (detail as { errorCode?: string }).errorCode === 'string'
            ? (detail as { errorCode?: string }).errorCode
            : 'http_401'
        setLines([
          { role: 'user', content: '帮我看看负载' },
          { role: 'assistant', content: message, variant: 'error', errorCode: errorCode || undefined }
        ])
        return
      }
      if (detail?.op === 'aiAccentStack') {
        screenshotForceKeyRef.current = true
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
      }`;

// Fix the replacement - the file uses real newlines not escaped. Re-read and do a more reliable splice.
s = fs.readFileSync(path, 'utf8');

// Re-apply state vars if needed
if (!s.includes('screenshotProtectionOverride')) {
  s = s.replace(
    `  const screenshotForceKeyRef = useRef(false)`,
    `  const screenshotForceKeyRef = useRef(false)${nl}  /** Round 14: screenshot-only protection override for prod banner (hooks on). */${nl}  const [screenshotProtectionOverride, setScreenshotProtectionOverride] = useState<ProtectionLevel | null>(null)${nl}  /** Round 14: keep D29 resume chip from being cleared by archive list effect. */${nl}  const screenshotResumeLockRef = useRef(false)`
  );
}

const marker = `      if (detail?.op === 'aiStreaming') {`;
const idx = s.indexOf(marker);
if (idx < 0) throw new Error('aiStreaming marker not found');
const afterReturn = s.indexOf('        return\n      }\n', idx);
const afterReturnCR = s.indexOf('        return\r\n      }\r\n', idx);
const endIdx = afterReturnCR >= 0 ? afterReturnCR + '        return\r\n      }\r\n'.length : afterReturn + '        return\n      }\n'.length;
if (afterReturn < 0 && afterReturnCR < 0) throw new Error('end of aiStreaming not found');

const block = `      if (detail?.op === 'aiStreaming') {
        // H04/H05: real busy + streaming card (partial text + in-card Stop). No DOM inject.
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        const partial =
          typeof (detail as { partial?: string }).partial === 'string' && (detail as { partial?: string }).partial!.trim()
            ? (detail as { partial?: string }).partial!.trim()
            : '正在分析 nginx 502…\\n先看 error.log 末尾：'
        setBusy(true)
        setLines([
          { role: 'user', content: 'nginx 502，帮我边生成边停一下看看' },
          { role: 'assistant', content: partial, streaming: true }
        ])
        return
      }
      if (detail?.op === 'aiCancelled') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        const partial =
          typeof (detail as { partial?: string }).partial === 'string' && (detail as { partial?: string }).partial!.trim()
            ? (detail as { partial?: string }).partial!.trim()
            : '正在分析 nginx 502…\\n（已停止，可点重试继续）'
        setLines([
          { role: 'user', content: 'nginx 502，帮我边生成边停一下看看' },
          { role: 'assistant', content: partial, cancelled: true }
        ])
        return
      }
      if (detail?.op === 'aiEmptyResume') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = true
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setLines([])
        const title =
          typeof (detail as { title?: string }).title === 'string' && (detail as { title?: string }).title!.trim()
            ? (detail as { title?: string }).title!.trim()
            : 'nginx 502 排错'
        setResumeHit({
          id: 'shot-r14-resume',
          group: 'demo-host',
          hostLabel: '演示主机',
          key: 'demo-host',
          title,
          savedAt: Date.now() - 120000,
          count: 6
        })
        return
      }
      if (detail?.op === 'aiProdBanner') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride('production')
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'auto', safetyTier: 'confirm' }))
        setLines([
          { role: 'user', content: '生产机上帮我看一下磁盘' },
          {
            role: 'assistant',
            content: '这是生产主机：自动执行仍会跑低/中风险只读命令，高危必须确认。',
            fresh: false,
            structured: {
              action: 'end',
              description: '这是生产主机：自动执行仍会跑低/中风险只读命令，高危必须确认。',
              riskLevel: 'low'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiSuggestCard') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'suggest', safetyTier: 'confirm' }))
        const cmd =
          typeof (detail as { command?: string }).command === 'string' && (detail as { command?: string }).command!.trim()
            ? (detail as { command?: string }).command!.trim()
            : 'systemctl status nginx --no-pager'
        const desc =
          typeof (detail as { description?: string }).description === 'string' &&
          (detail as { description?: string }).description!.trim()
            ? (detail as { description?: string }).description!.trim()
            : '查看 nginx 服务状态（只读）。'
        setLines([
          { role: 'user', content: '仅建议模式下，给我一条可复制的排查命令' },
          {
            role: 'assistant',
            content: desc,
            requestId: 'shot-r14-suggest',
            fresh: true,
            safetyMode: 'suggest',
            structured: { action: 'command', description: desc, command: cmd, riskLevel: 'low' }
          }
        ])
        return
      }
      if (detail?.op === 'aiError') {
        screenshotForceKeyRef.current = true
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        const message =
          typeof (detail as { message?: string }).message === 'string' && (detail as { message?: string }).message!.trim()
            ? (detail as { message?: string }).message!.trim()
            : '模型请求失败：请检查 API Key 或网络后重试。'
        const errorCode =
          typeof (detail as { errorCode?: string }).errorCode === 'string'
            ? (detail as { errorCode?: string }).errorCode
            : 'http_401'
        setLines([
          { role: 'user', content: '帮我看看负载' },
          { role: 'assistant', content: message, variant: 'error', errorCode: errorCode || undefined }
        ])
        return
      }
      if (detail?.op === 'aiAccentStack') {
        screenshotForceKeyRef.current = true
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
`;

// Problem: I'm putting literal \\n in Chinese strings - need real \n in the TS source string literals
const blockFixed = block
  .replace('正在分析 nginx 502…\\n先看 error.log 末尾：', '正在分析 nginx 502…\\n先看 error.log 末尾：')
  .replace('正在分析 nginx 502…\\n（已停止，可点重试继续）', '正在分析 nginx 502…\\n（已停止，可点重试继续）');

s = s.slice(0, idx) + blockFixed + s.slice(endIdx);

// 3) Guard resume effect
const resumeEffect = `  useEffect(() => {
    setResumeHit(null)
    if (!resumeGroup || lines.length > 0 || !window.aiss.ai.chatArchive) return`;
if (!s.includes('screenshotResumeLockRef.current')) {
  // may already have from state insert; patch effect
}
if (s.includes(resumeEffect) && !s.includes('if (screenshotResumeLockRef.current) return')) {
  s = s.replace(
    resumeEffect,
    `  useEffect(() => {
    if (screenshotResumeLockRef.current) return
    setResumeHit(null)
    if (!resumeGroup || lines.length > 0 || !window.aiss.ai.chatArchive) return`
  );
}

// 4) Use override in panelProdAuto / protection resolution
const protLine = `    level: protection === 'production' ? 'production' : protection === 'readonly' ? 'readonly' : 'normal',`;
if (!s.includes('screenshotProtectionOverride ?? protection')) {
  // Add effective protection before panelProdAuto
  const marker2 = `  const panelProdAuto = prodAutoHint({`;
  if (!s.includes(marker2)) throw new Error('panelProdAuto missing');
  s = s.replace(
    marker2,
    `  const protectionForUi = screenshotProtectionOverride ?? protection
  const panelProdAuto = prodAutoHint({`
  );
  s = s.replace(
    `  const panelProdAuto = prodAutoHint({
    level: protection === 'production' ? 'production' : protection === 'readonly' ? 'readonly' : 'normal',
    paused: Boolean(elevated && protection === 'production'),`,
    `  const panelProdAuto = prodAutoHint({
    level: protectionForUi === 'production' ? 'production' : protectionForUi === 'readonly' ? 'readonly' : 'normal',
    paused: Boolean(elevated && protectionForUi === 'production'),`
  );
}

// Also update aiPolicy resolve to use protectionForUi for consistency when override set
s = s.replace(
  `  const aiPolicy = resolveAiPolicy({
    settings: safetySettings,
    hostPolicy,
    tempOverride: tempPolicy,
    protection: activeSessionId ? { level: protection, elevated } : null
  })`,
  `  const aiPolicy = resolveAiPolicy({
    settings: safetySettings,
    hostPolicy,
    tempOverride: tempPolicy,
    protection:
      screenshotProtectionOverride || activeSessionId
        ? { level: (screenshotProtectionOverride ?? protection) as ProtectionLevel, elevated: screenshotProtectionOverride ? false : elevated }
        : null
  })`
);

fs.writeFileSync(path, s, 'utf8');
console.log('AIPanel patched', s.length);

// Verify markers
for (const k of ['aiCancelled', 'aiEmptyResume', 'aiProdBanner', 'aiSuggestCard', 'aiAccentStack', 'protectionForUi', 'screenshotResumeLockRef']) {
  if (!s.includes(k)) console.error('MISSING', k);
  else console.log('ok', k);
}
