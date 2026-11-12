# -*- coding: utf-8 -*-
"""Round 29 item 1: readonly host calm banner (symmetric to prod-auto)."""
from pathlib import Path

ROOT = Path('.')

# --- 1) shared helper ---
hint = ROOT / 'src/shared/readonly-host-hint.ts'
hint.write_text('''/**
 * Round 29: read-only host calm banner inside the AI panel.
 * Symmetric to prod-auto-hint: visibility only — main process already blocks AI writes.
 * Elevation may unlock the terminal; AI still never writes on readonly (aiEffectiveLevel).
 */
import type { AiPolicy, ResolvedAiPolicy } from './ai-policy'

export type ReadonlyHostHint = {
  source: ResolvedAiPolicy['source']
  chosen: AiPolicy
  effective: AiPolicy
  /** True when protection forced suggest. */
  capped: boolean
}

export function readonlyHostHint(input: {
  level: 'normal' | 'production' | 'readonly'
  policy: Pick<ResolvedAiPolicy, 'chosen' | 'effective' | 'source' | 'cappedBy'>
}): ReadonlyHostHint | null {
  if (input.level !== 'readonly') return null
  return {
    source: input.policy.source,
    chosen: input.policy.chosen,
    effective: input.policy.effective,
    capped: input.policy.cappedBy === 'readonly' || input.policy.effective === 'suggest'
  }
}
''', encoding='utf-8')
print('shared ok')

# --- 2) i18n ---
i18n = ROOT / 'src/renderer/src/lib/i18n.tsx'
it = i18n.read_text(encoding='utf-8')
zh_keys = {
  "roHost.chip": "只读主机 · AI 不会写入",
  "roHost.panelHint": "变更只作建议，写入会被拦截 · 点击查看策略",
  "roHost.tip": "当前主机为只读保护（{source}）。AI 不会向终端写入任何命令；变更类步骤只会作为建议。临时解锁只影响人工终端输入，AI 仍保持只读。",
}
en_keys = {
  "roHost.chip": "Read-only · AI will not write",
  "roHost.panelHint": "Changes are suggestions only; writes are blocked · click for policy",
  "roHost.tip": "This host is read-only protected ({source}). AI will not write any command to the terminal; change steps stay suggestions. Temporary unlock affects human terminal input only — AI stays read-only.",
}

def insert_after(text: str, anchor_key: str, new_entries: dict, lang: str) -> str:
    # Find the line with anchor_key and insert after the full key cluster ending that statement
    marker = f"'{anchor_key}':"
    idx = 0
    found = 0
    # zh block first occurrence, en second — we process langs separately by searching from start/end
    positions = []
    start = 0
    while True:
        i = text.find(marker, start)
        if i < 0:
            break
        positions.append(i)
        start = i + 1
    assert len(positions) >= 2, f'need zh+en for {anchor_key}, got {len(positions)}'
    pos = positions[0] if lang == 'zh' else positions[1]
    # find end of this key's value (ends with ", or ', then maybe more keys on same line)
    # prodAuto keys are on a long line. Insert right after prodAuto.panelHint entry.
    # Find the closing of panelHint value.
    line_start = text.rfind('\n', 0, pos) + 1
    # Walk to end of the statement containing panelHint — often multiple keys on one line.
    # Safer: insert a new line before the next key after panelHint on that area.
    # Find `'prodAuto.panelHint': "..."` or `'...'` and insert after that pair.
    import re
    m = re.search(r"'prodAuto\.panelHint':\s*(?:\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')\s*,?", text[pos:pos+800])
    assert m, f'panelHint value not found near {lang}'
    abs_end = pos + m.end()
    block = ''.join(f"'{k}': {repr(v)}, " for k,v in new_entries.items())
    # use double quotes like neighboring style for Chinese
    parts = []
    for k,v in new_entries.items():
        parts.append(f"'{k}': \"{v}\"")
    insert = ' ' + ', '.join(parts) + ','
    # if next char after abs_end is whitespace/newline, keep
    return text[:abs_end] + insert + text[abs_end:]

if "roHost.chip" not in it:
    it = insert_after(it, 'prodAuto.panelHint', zh_keys, 'zh')
    it = insert_after(it, 'prodAuto.panelHint', en_keys, 'en')
    i18n.write_text(it, encoding='utf-8')
    print('i18n ok')
else:
    print('i18n already')

# --- 3) AIPanel import + compute + JSX ---
panel = ROOT / 'src/renderer/src/components/AIPanel.tsx'
pt = panel.read_text(encoding='utf-8')

if "readonly-host-hint" not in pt:
    old_imp = "import { OPEN_AI_POLICY_EVENT, prodAutoHint } from '@shared/prod-auto-hint'"
    new_imp = old_imp + "\nimport { readonlyHostHint } from '@shared/readonly-host-hint'"
    assert old_imp in pt
    pt = pt.replace(old_imp, new_imp, 1)
    print('import ok')
else:
    print('import already')

# compute after panelProdAuto
anchor_compute = """  const panelProdAuto = prodAutoHint({
    level: protectionForUi === 'production' ? 'production' : protectionForUi === 'readonly' ? 'readonly' : 'normal',
    paused: Boolean(elevated && protectionForUi === 'production'),
    policy: aiPolicy
  })
"""
compute_add = anchor_compute + """  const panelReadonly = readonlyHostHint({
    level: protectionForUi === 'readonly' ? 'readonly' : protectionForUi === 'production' ? 'production' : 'normal',
    policy: aiPolicy
  })
"""
if 'panelReadonly = readonlyHostHint' not in pt:
    assert anchor_compute in pt, 'panelProdAuto block missing'
    pt = pt.replace(anchor_compute, compute_add, 1)
    print('compute ok')
else:
    print('compute already')

# JSX after prod banner block
banner_anchor = """      {panelProdAuto ? (
        <button
          type="button"
          className={`ai-prod-auto-banner${panelProdAuto.autoHighRisk ? ' is-high' : ''}`}
          data-testid="ai-prod-auto-banner"
          title={tg('prodAuto.tip', {
            source: tg(`policy.source.${panelProdAuto.source}` as 'policy.source.global')
          })}
          onClick={() => setSafetyOpen(true)}
        >
          <span className="ai-prod-auto-dot" aria-hidden="true" />
          <span className="ai-prod-auto-text">
            {panelProdAuto.autoHighRisk ? tg('prodAuto.chipHigh') : tg('prodAuto.chip')}
          </span>
          <span className="ai-prod-auto-hint">{tg('prodAuto.panelHint')}</span>
        </button>
      ) : null}
"""
ro_jsx = banner_anchor + """
      {panelReadonly && !panelProdAuto ? (
        <button
          type="button"
          className="ai-readonly-banner"
          data-testid="ai-readonly-banner"
          title={tg('roHost.tip', {
            source: tg(`policy.source.${panelReadonly.source}` as 'policy.source.global')
          })}
          onClick={() => setSafetyOpen(true)}
        >
          <span className="ai-readonly-dot" aria-hidden="true" />
          <span className="ai-readonly-text">{tg('roHost.chip')}</span>
          <span className="ai-readonly-hint">{tg('roHost.panelHint')}</span>
        </button>
      ) : null}
"""
if 'data-testid="ai-readonly-banner"' not in pt:
    assert banner_anchor in pt, 'prod banner JSX missing'
    pt = pt.replace(banner_anchor, ro_jsx, 1)
    print('jsx ok')
else:
    print('jsx already')

# screenshot op aiReadonlyBanner near aiProdBanner
if "detail?.op === 'aiReadonlyBanner'" not in pt:
    prod_shot = """      if (detail?.op === 'aiProdBanner') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
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
"""
    ro_shot = prod_shot + """      if (detail?.op === 'aiReadonlyBanner') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride('readonly')
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'ask', safetyTier: 'confirm' }))
        setLines([
          { role: 'user', content: '只读主机上帮我改一下配置' },
          {
            role: 'assistant',
            content: '这是只读主机：AI 不会写入终端；变更步骤只会作为建议，可复制或填入命令栏。',
            fresh: false,
            structured: {
              action: 'end',
              description: '这是只读主机：AI 不会写入终端；变更步骤只会作为建议，可复制或填入命令栏。',
              riskLevel: 'low'
            }
          }
        ])
        return
      }
"""
    assert prod_shot in pt, 'aiProdBanner shot missing'
    pt = pt.replace(prod_shot, ro_shot, 1)
    print('shot op ok')
else:
    print('shot op already')

# Also clear screenshotProtectionOverride in clearShot paths — already sets null in clearShotAiOp callers.
# When other ops clear override they already set null — good.

panel.write_text(pt, encoding='utf-8')
print('panel written')

# --- 4) CSS ---
css = ROOT / 'src/renderer/src/styles.css'
ct = css.read_text(encoding='utf-8')
r29css = """
/* Round 29: read-only host calm banner (symmetric to prod-auto; ok/info tone) */
.ai-readonly-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 6px 12px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-ok) 35%, transparent);
  background: color-mix(in srgb, var(--color-ok) 10%, transparent);
  color: var(--color-fg);
  font-size: var(--fs-xs);
  text-align: left;
  cursor: pointer;
}
.ai-readonly-banner:hover {
  background: color-mix(in srgb, var(--color-ok) 18%, transparent);
}
.ai-readonly-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-ok);
  flex: 0 0 auto;
}
.ai-readonly-text { font-weight: 600; white-space: nowrap; }
.ai-readonly-hint {
  color: var(--color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
"""
if 'Round 29: read-only host calm banner' not in ct:
    # insert after prod-auto-hint block
    marker = '.ai-prod-auto-hint {\n  color: var(--color-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}'
    if marker in ct:
        ct = ct.replace(marker, marker + '\n' + r29css, 1)
    else:
        ct = ct.rstrip() + '\n' + r29css
    css.write_text(ct, encoding='utf-8')
    print('css ok')
else:
    print('css already')

# --- 5) screenshot-hooks type ---
hooks = ROOT / 'src/renderer/src/lib/screenshot-hooks.ts'
ht = hooks.read_text(encoding='utf-8')
if 'aiReadonlyBanner' not in ht:
    # find aiProdBanner type if any, or add near aiProd
    if 'aiProdBanner' in ht:
        ht = ht.replace(
            '| { op: "aiProdBanner"',
            '| { op: "aiProdBanner"',
            1
        )
        # add new union member after aiProdBanner line
        import re
        m = re.search(r'\|\s*\{\s*op:\s*"aiProdBanner"[^}]*\}', ht)
        if m:
            ht = ht[:m.end()] + '\n  | { op: "aiReadonlyBanner" }' + ht[m.end():]
            print('hooks via prod')
        else:
            # loose: insert before auditFilterEmpty or at end of union
            needle = '| { op: "auditFilterEmpty"'
            if needle in ht:
                ht = ht.replace(needle, '| { op: "aiReadonlyBanner" }\n  ' + needle, 1)
                print('hooks via audit')
            else:
                raise SystemExit('cannot find hooks insert point')
    else:
        needle = '| { op: "auditFilterEmpty"'
        assert needle in ht
        ht = ht.replace(needle, '| { op: "aiReadonlyBanner" }\n  ' + needle, 1)
        print('hooks via audit (no prod type)')
    hooks.write_text(ht, encoding='utf-8')
else:
    print('hooks already')

print('item1 patch done')
