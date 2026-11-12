# -*- coding: utf-8 -*-
"""R26 item2: failure+memory hierarchy + calm audit filter-empty copy."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

# --- i18n ---
i18n = ROOT / "src/renderer/src/lib/i18n.tsx"
i = i18n.read_text(encoding="utf-8")
if "'au2.filterEmptyTitle'" not in i:
    i = i.replace(
        "'au2.openAiMissAction': '回到顶部',\n",
        "'au2.openAiMissAction': '回到顶部',\n"
        "  'au2.filterEmptyTitle': '没有符合筛选的记录',\n"
        "  'au2.filterEmptyDesc': '试试清空筛选或换个关键词',\n"
        "  'au2.clearFilters': '清空筛选',\n",
        1,
    )
    i = i.replace(
        "'au2.openAiMissAction': 'Back to top',\n",
        "'au2.openAiMissAction': 'Back to top',\n"
        "  'au2.filterEmptyTitle': 'No entries match these filters',\n"
        "  'au2.filterEmptyDesc': 'Clear filters or try another keyword',\n"
        "  'au2.clearFilters': 'Clear filters',\n",
        1,
    )
    i18n.write_text(i, encoding="utf-8")
    print("i18n: filter-empty ok")
else:
    print("i18n: already")

# --- AuditLogPanel ---
alp = ROOT / "src/renderer/src/components/AuditLogPanel.tsx"
a = alp.read_text(encoding="utf-8")
if "audit-filter-empty" not in a:
    # insert helper after rows useMemo / focusMissing
    needle = "  const focusMissing = Boolean(focusId && !events.some((e) => e.id === focusId))\n"
    insert = needle + (
        "  const filterEmpty = events.length > 0 && rows.length === 0\n"
        "  const clearFilters = () => {\n"
        "    setText('')\n"
        "    setType('')\n"
        "    setSource('')\n"
        "    setSince('')\n"
        "    setUntil('')\n"
        "    setRange('all')\n"
        "  }\n"
    )
    if needle not in a:
        raise SystemExit("focusMissing line missing")
    a = a.replace(needle, insert, 1)

    old_empty = """        {rows.length === 0 ? (
          <EmptyState
            testId=\"audit-empty\"
            icon=\"audit\"
            title={t('pf4.auditTitle')}
            desc={t('pf4.auditDesc')}
            primary={{
              label: t('pf4.auditCta'),
              onClick: () => (enabled ? document.querySelector<HTMLButtonElement>('[data-testid=\"audit-more\"]')?.click() : onToggle(true))
            }}
          />
        ) : (
"""
    new_empty = """        {rows.length === 0 ? (
          filterEmpty ? (
            <EmptyState
              testId=\"audit-filter-empty\"
              icon=\"audit\"
              title={t('au2.filterEmptyTitle')}
              desc={t('au2.filterEmptyDesc')}
              primary={{
                label: t('au2.clearFilters'),
                testId: 'audit-clear-filters',
                onClick: clearFilters
              }}
            />
          ) : (
            <EmptyState
              testId=\"audit-empty\"
              icon=\"audit\"
              title={t('pf4.auditTitle')}
              desc={t('pf4.auditDesc')}
              primary={{
                label: t('pf4.auditCta'),
                onClick: () => (enabled ? document.querySelector<HTMLButtonElement>('[data-testid=\"audit-more\"]')?.click() : onToggle(true))
              }}
            />
          )
        ) : (
"""
    if old_empty not in a:
        raise SystemExit("empty state block missing")
    a = a.replace(old_empty, new_empty, 1)
    alp.write_text(a, encoding="utf-8")
    print("AuditLogPanel: filter-empty ok")
else:
    print("AuditLogPanel: already")

# --- CSS hierarchy ---
css = ROOT / "src/renderer/src/styles.css"
c = css.read_text(encoding="utf-8")
marker = "/* R26 Round26: failure pin + memory chip hierarchy */"
if marker not in c:
    block = """
/* R26 Round26: failure pin + memory chip hierarchy */
/* Failure evidence is the primary story; memory chip stays calm chrome. */
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip {
  color: var(--color-text-muted);
  opacity: 0.78;
}
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip:hover,
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip.is-open,
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip:focus-visible,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip:hover,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip.is-open,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip:focus-visible {
  opacity: 1;
  color: var(--color-text-muted);
  background: var(--color-fill-muted);
}
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-pop {
  z-index: 30;
}

"""
    # Insert before R20 memory block or after R25 memory jump styles
    anchor = "/* R25 Round25: working-memory expand UX */"
    if anchor not in c:
        # append after R20 block end near ai-header-shortcut
        anchor2 = ".ai-panel .ai-header-shortcut kbd {"
        if anchor2 not in c:
            raise SystemExit("CSS anchor missing")
        c = c.replace(anchor2, block + anchor2, 1)
    else:
        c = c.replace(anchor, block + anchor, 1)
    # No token fallbacks in new block
    css.write_text(c, encoding="utf-8")
    print("css: hierarchy ok")
else:
    print("css: already")

# --- Also seed memory when failure evidence for hierarchy co-presence (screenshot/real path readiness) ---
# Extend aiFailureEvidence to optionally keep/set memoryView so both can share screen in demos.
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
p = panel.read_text(encoding="utf-8")
if "withMemory" not in p.split("aiFailureEvidence")[1][:800]:
    # After setMemoryOpen(false) in aiFailureEvidence, optionally seed collapsed memory
    old = """      if (detail?.op === 'aiFailureEvidence') {
        // Round 21: pin failure evidence on a reply card (S27 visibility).
        // Round 22: do not call setTurnPending here — it is scoped to the stream handler below.
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(false)
        setPendingConfirm(null)
        setRunProgress(null)
        setMemoryOpen(false)
"""
    new = """      if (detail?.op === 'aiFailureEvidence') {
        // Round 21: pin failure evidence on a reply card (S27 visibility).
        // Round 22: do not call setTurnPending here — it is scoped to the stream handler below.
        // Round 26: optional withMemory seeds collapsed chip so failure+memory hierarchy is testable.
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(false)
        setPendingConfirm(null)
        setRunProgress(null)
        setMemoryOpen(false)
        if ((detail as { withMemory?: boolean }).withMemory) {
          const mem = buildMemoryEvidenceView({
            goal: '排查 nginx 502',
            hostFacts: ['web-01 / 10.0.0.8'],
            observations: ['df：/ 使用 91%'],
            recentCommands: ['echo S27_FAIL_CMD']
          })
          setWorkingGoal(mem.goal)
          setMemoryView(mem)
        }
"""
    if old not in p:
        raise SystemExit("aiFailureEvidence head missing for withMemory")
    p = p.replace(old, new, 1)
    panel.write_text(p, encoding="utf-8")
    print("AIPanel: withMemory on failure ok")
else:
    print("AIPanel: withMemory already")

# Update hooks type for withMemory
hooks = ROOT / "src/renderer/src/lib/screenshot-hooks.ts"
h = hooks.read_text(encoding="utf-8")
old_f = '  | { op: "aiFailureEvidence"; nextConfirm?: string }'
new_f = '  | { op: "aiFailureEvidence"; nextConfirm?: string; withMemory?: boolean }'
if "withMemory?: boolean" not in h:
    if old_f not in h:
        raise SystemExit("aiFailureEvidence type missing")
    h = h.replace(old_f, new_f, 1)
    hooks.write_text(h, encoding="utf-8")
    print("hooks: withMemory ok")
else:
    print("hooks: already")

# --- test ---
test = ROOT / "scripts/test-r26-hierarchy-audit-empty.ts"
test.write_text(
    r'''/** R26 polish: failure+memory hierarchy + calm audit filter-empty copy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(translate('zh-CN', 'au2.filterEmptyTitle'), '没有符合筛选的记录')
assert.equal(translate('zh-CN', 'au2.filterEmptyDesc'), '试试清空筛选或换个关键词')
assert.equal(translate('zh-CN', 'au2.clearFilters'), '清空筛选')
assert.equal(translate('en', 'au2.filterEmptyTitle'), 'No entries match these filters')
assert.equal(translate('en', 'au2.clearFilters'), 'Clear filters')
// true-empty copy must stay distinct
assert.equal(translate('zh-CN', 'pf4.auditTitle'), '还没有审计记录')
assert.notEqual(translate('zh-CN', 'au2.filterEmptyTitle'), translate('zh-CN', 'pf4.auditTitle'))

const alp = norm('src/renderer/src/components/AuditLogPanel.tsx')
assert.ok(alp.includes('filterEmpty'))
assert.ok(alp.includes("events.length > 0 && rows.length === 0"))
assert.ok(alp.includes('audit-filter-empty'))
assert.ok(alp.includes('audit-clear-filters'))
assert.ok(alp.includes("t('au2.filterEmptyTitle')"))
assert.ok(alp.includes("t('au2.clearFilters')"))
assert.ok(alp.includes('clearFilters'))
assert.ok(alp.includes("testId=\"audit-empty\""), 'true-empty path kept')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R26 Round26: failure pin + memory chip hierarchy'))
assert.ok(css.includes(":has([data-testid='ai-failure-evidence'])"))
assert.ok(css.includes('.ai-memory-chip'))
const start = css.indexOf('R26 Round26: failure pin + memory chip hierarchy')
const end = css.indexOf('R25 Round25: working-memory expand UX', start)
const block = css.slice(start, end > start ? end : start + 900)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R26 CSS')
assert.ok(block.includes('opacity: 0.78') || block.includes('opacity:0.78'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('withMemory'))
assert.ok(panel.includes("detail as { withMemory?: boolean }") || panel.includes('withMemory?: boolean'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('withMemory?: boolean'))

console.log('test-r26-hierarchy-audit-empty: ok')
''',
    encoding="utf-8",
)
print("test: written")
print("item2 patch done")
