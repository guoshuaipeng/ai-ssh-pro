# -*- coding: utf-8 -*-
"""Round 22 item 2: failure→next-confirm link + audit miss weak toast polish."""
from pathlib import Path
import json
import re

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- 1) shared helper for audit miss toast (testable) ---
helper = r'''/** Round 22: audit → AI jump miss — calm info toast (not error). */
export type AuditOpenAiMissToast = {
  messageKey: 'au2.openAiMiss'
  actionKey: 'au2.openAiMissAction'
  kind: 'info'
  theme: 'info'
  ms: number
}

export function buildAuditOpenAiMissToast(): AuditOpenAiMissToast {
  return {
    messageKey: 'au2.openAiMiss',
    actionKey: 'au2.openAiMissAction',
    kind: 'info',
    theme: 'info',
    ms: 7000
  }
}

/** True when any assistant line carries a failed exec pin (for next-confirm accent). */
export function hasFailedExecPin(
  lines: ReadonlyArray<{ role?: string; exec?: { status?: string } | null }>
): boolean {
  return lines.some((l) => l?.role === 'assistant' && l.exec?.status === 'failed')
}
'''
(ROOT / "src/shared/ai-audit-miss.ts").write_text(helper, encoding="utf-8")
print("shared helper written")

# --- 2) i18n keys ---
i18n_path = ROOT / "src/renderer/src/lib/i18n.tsx"
i18n = i18n_path.read_text(encoding="utf-8")

def upsert_i18n(text: str, after_key: str, new_entries_zh: list[tuple[str,str]], new_entries_en: list[tuple[str,str]]) -> str:
    # zh block: replace openAiMiss line and insert after
    zh_old = "  'au2.openAiMiss': '未在当前对话找到该步骤',"
    zh_new = (
        "  'au2.openAiMiss': '当前对话里没有这条步骤（可能已新开对话或不在本会话）',\n"
        "  'au2.openAiMissAction': '回到顶部',\n"
        "  'fail.nextConfirm': '下一步待确认',\n"
        "  'fail.nextConfirmTip': '滚动到确认坞；主操作仍是同意执行，不会静默写入',"
    )
    if zh_old not in text:
        # maybe already patched
        if "au2.openAiMissAction" in text:
            print("i18n zh already")
        else:
            raise SystemExit("zh openAiMiss not found")
    else:
        text = text.replace(zh_old, zh_new, 1)

    en_old = "  'au2.openAiMiss': 'Step not found in the current chat',"
    en_new = (
        "  'au2.openAiMiss': 'That step is not in the current chat (new chat or different session)',\n"
        "  'au2.openAiMissAction': 'Back to top',\n"
        "  'fail.nextConfirm': 'Next confirm',\n"
        "  'fail.nextConfirmTip': 'Scroll to the confirm dock; Agree stays primary — never silent write',"
    )
    if en_old not in text:
        if "au2.openAiMissAction" in text and "Next confirm" in text:
            print("i18n en already")
        else:
            raise SystemExit("en openAiMiss not found")
    else:
        text = text.replace(en_old, en_new, 1)
    return text

i18n = upsert_i18n(i18n, "", [], [])
i18n_path.write_text(i18n, encoding="utf-8")
print("i18n updated")

# --- 3) AIPanel: toast + next-confirm link + enhance shot op ---
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
panel = panel_path.read_text(encoding="utf-8")

# import helper
if "buildAuditOpenAiMissToast" not in panel:
    # find a nearby import from @shared
    if "from '@shared/ai-exec-replay'" in panel:
        panel = panel.replace(
            "from '@shared/ai-exec-replay'",
            "from '@shared/ai-exec-replay'\nimport { buildAuditOpenAiMissToast, hasFailedExecPin } from '@shared/ai-audit-miss'",
            1,
        )
    elif 'from "@shared/ai-exec-replay"' in panel:
        panel = panel.replace(
            'from "@shared/ai-exec-replay"',
            'from "@shared/ai-exec-replay"\nimport { buildAuditOpenAiMissToast, hasFailedExecPin } from "@shared/ai-audit-miss"',
            1,
        )
    else:
        # try buildFailureEvidenceView import line
        m = re.search(r"import \{[^}]+\} from '@shared/ai-exec-replay'", panel)
        if not m:
            raise SystemExit("cannot find ai-exec-replay import")
        panel = panel.replace(
            m.group(0),
            m.group(0) + "\nimport { buildAuditOpenAiMissToast, hasFailedExecPin } from '@shared/ai-audit-miss'",
            1,
        )
    print("import added")

# replace miss toast
old_toast = """    if (!el) {
      showToast(tg('au2.openAiMiss'))
      return
    }"""
new_toast = """    if (!el) {
      // Round 22: calm info toast + scroll-to-top action (R17 weak-toast debt).
      const miss = buildAuditOpenAiMissToast()
      showToast(tg(miss.messageKey), {
        kind: miss.kind,
        theme: miss.theme,
        ms: miss.ms,
        action: {
          label: tg(miss.actionKey),
          run: () => {
            const list = document.querySelector<HTMLElement>('.ai-panel .ai-messages, .ai-panel [data-testid=\"ai-messages\"]')
            if (list) list.scrollTo({ top: 0, behavior: 'smooth' })
            else document.querySelector('.ai-panel')?.scrollTo?.({ top: 0, behavior: 'smooth' } as ScrollToOptions)
          }
        }
      })
      return
    }"""
# Fix escaping - in the actual file we want real quotes not escaped
new_toast = """    if (!el) {
      // Round 22: calm info toast + scroll-to-top action (R17 weak-toast debt).
      const miss = buildAuditOpenAiMissToast()
      showToast(tg(miss.messageKey), {
        kind: miss.kind,
        theme: miss.theme,
        ms: miss.ms,
        action: {
          label: tg(miss.actionKey),
          run: () => {
            const list = document.querySelector<HTMLElement>('.ai-panel .ai-messages, .ai-panel [data-testid="ai-messages"]')
            if (list) list.scrollTo({ top: 0, behavior: 'smooth' })
            else {
              const root = document.querySelector('.ai-panel') as HTMLElement | null
              root?.scrollTo?.({ top: 0, behavior: 'smooth' })
            }
          }
        }
      })
      return
    }"""
if old_toast not in panel:
    if "buildAuditOpenAiMissToast" in panel and "miss.actionKey" in panel:
        print("toast already")
    else:
        raise SystemExit("miss toast block not found")
else:
    panel = panel.replace(old_toast, new_toast, 1)
    print("toast patched")

# enhance aiFailureEvidence shot to support nextConfirm
old_fail_shot_end = """            exec: {
              status: 'failed',
              at: Date.now() - 1200,
              durationMs: 420,
              exitCode: 1,
              summary: 'S27_STDERR_EVIDENCE',
              outputLines: 1,
              failureKind: 'nonzero',
              evidence,
              retryBudget: { count: 1, cap: 2, exhausted: false }
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiMemoryEvidence') {"""

new_fail_shot_end = """            exec: {
              status: 'failed',
              at: Date.now() - 1200,
              durationMs: 420,
              exitCode: 1,
              summary: 'S27_STDERR_EVIDENCE',
              outputLines: 1,
              failureKind: 'nonzero',
              evidence,
              retryBudget: { count: 1, cap: 2, exhausted: false }
            }
          }
        ])
        const nextCmd =
          typeof (detail as { nextConfirm?: string }).nextConfirm === 'string'
            ? (detail as { nextConfirm?: string }).nextConfirm!.trim()
            : ''
        if (nextCmd) {
          // Round 22: failure pin + next confirm dock (plan-step link visual).
          setRunProgress({ step: 2, max: 3, policy: 'ask' })
          setPendingConfirm({ requestId: 'shot-r22-next', action: 'command' })
          setPendingPreviewHold(nextCmd)
          setLines((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `下一步建议：${nextCmd}`,
              structured: {
                description: `下一步建议：${nextCmd}`,
                action: 'command',
                command: nextCmd,
                riskLevel: 'medium',
                completed: false
              },
              requestId: 'shot-r22-next',
              fresh: true
            }
          ])
        }
        return
      }
      if (detail?.op === 'aiMemoryEvidence') {"""

if old_fail_shot_end not in panel:
    if "shot-r22-next" in panel:
        print("fail shot nextConfirm already")
    else:
        raise SystemExit("fail shot end block not found")
else:
    panel = panel.replace(old_fail_shot_end, new_fail_shot_end, 1)
    print("fail shot nextConfirm patched")

# Check setPendingPreviewHold exists
if "setPendingPreviewHold" not in panel:
    raise SystemExit("setPendingPreviewHold missing")

# Add next-confirm button after ExecReplay + data-after-failure on dock
old_exec = """                {l.exec ? (
                  <ExecReplay
                    exec={l.exec}
                    host={conversation ? conversationLabel(conversation.hostLabel, conversation.n) : hostName || undefined}
                    command={s.command}
                    busy={busy}
                    onRetryWithEvidence={retryWithFailureEvidence}
                  />
                ) : null}"""

new_exec = """                {l.exec ? (
                  <>
                    <ExecReplay
                      exec={l.exec}
                      host={conversation ? conversationLabel(conversation.hostLabel, conversation.n) : hostName || undefined}
                      command={s.command}
                      busy={busy}
                      onRetryWithEvidence={retryWithFailureEvidence}
                    />
                    {pendingConfirm && l.exec.status === 'failed' ? (
                      <button
                        type="button"
                        className="link-btn ai-failure-next-confirm"
                        data-testid="ai-failure-next-confirm"
                        title={tg('fail.nextConfirmTip')}
                        onClick={() => {
                          const dock = document.querySelector<HTMLElement>('[data-testid="ai-pending-confirm"]')
                          if (!dock) return
                          dock.classList.add('is-after-failure-focus')
                          dock.setAttribute('data-after-failure-focus', '1')
                          dock.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                          window.setTimeout(() => {
                            dock.classList.remove('is-after-failure-focus')
                            dock.removeAttribute('data-after-failure-focus')
                          }, 4200)
                          pendingAgreeRef.current?.focus()
                        }}
                      >
                        {tg('fail.nextConfirm')}
                        {alignedPlan.step ? ` · ${tg('ai.activePlanStep', { n: alignedPlan.step, max: Math.max(alignedPlan.max, alignedPlan.step, 1) })}` : ''}
                      </button>
                    ) : null}
                  </>
                ) : null}"""

if old_exec not in panel:
    if "ai-failure-next-confirm" in panel:
        print("next-confirm btn already")
    else:
        raise SystemExit("ExecReplay block not found for next-confirm")
else:
    panel = panel.replace(old_exec, new_exec, 1)
    print("next-confirm btn patched")

# pending dock data-after-failure
old_dock = """        <div
          className="ai-pending-confirm"
          role="region"
          tabIndex={-1}
          aria-label={tg('ux64.pendingTitle')}
          data-testid="ai-pending-confirm"
          data-action={pendingConfirm.action}
          data-r19-narrow="1"
        >"""

new_dock = """        <div
          className={`ai-pending-confirm${hasFailedExecPin(lines) ? ' is-after-failure' : ''}`}
          role="region"
          tabIndex={-1}
          aria-label={tg('ux64.pendingTitle')}
          data-testid="ai-pending-confirm"
          data-action={pendingConfirm.action}
          data-r19-narrow="1"
          data-after-failure={hasFailedExecPin(lines) ? '1' : undefined}
        >"""

if old_dock not in panel:
    if "data-after-failure=" in panel:
        print("dock after-failure already")
    else:
        raise SystemExit("pending dock block not found")
else:
    panel = panel.replace(old_dock, new_dock, 1)
    print("dock after-failure patched")

# Problem: alignedPlan used inside map - need to ensure it's in scope at that point.
# From earlier, alignedPlan is computed before render of lines. Check.
if "const alignedPlan" not in panel and "alignedPlan =" not in panel:
    # might be useMemo
    if "alignedPlan" not in panel:
        raise SystemExit("alignedPlan missing")

panel_path.write_text(panel, encoding="utf-8")
print("AIPanel written")

# --- 4) screenshot hooks: allow nextConfirm on aiFailureEvidence ---
hooks_path = ROOT / "src/renderer/src/lib/screenshot-hooks.ts"
hooks = hooks_path.read_text(encoding="utf-8")
old_h = '| { op: "aiFailureEvidence" }'
new_h = '| { op: "aiFailureEvidence"; nextConfirm?: string }'
if old_h in hooks:
    hooks = hooks.replace(old_h, new_h, 1)
    hooks_path.write_text(hooks, encoding="utf-8")
    print("hooks typed")
elif 'nextConfirm?: string' in hooks:
    print("hooks already")
else:
    # try single quotes
    old_h2 = "| { op: 'aiFailureEvidence' }"
    new_h2 = "| { op: 'aiFailureEvidence'; nextConfirm?: string }"
    if old_h2 in hooks:
        hooks = hooks.replace(old_h2, new_h2, 1)
        hooks_path.write_text(hooks, encoding="utf-8")
        print("hooks typed (sq)")
    else:
        raise SystemExit("hooks aiFailureEvidence not found")

# --- 5) CSS ---
css_path = ROOT / "src/renderer/src/styles.css"
css = css_path.read_text(encoding="utf-8")
marker = "/* R22 Round22: failure→next-confirm link + after-failure dock */"
if marker not in css:
    block = """
/* R22 Round22: failure→next-confirm link + after-failure dock */
.ai-panel .ai-failure-next-confirm {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  margin: 0 0 var(--space-2);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-accent);
  font-size: var(--fs-xs);
  cursor: pointer;
  text-align: left;
}
.ai-panel .ai-failure-next-confirm:hover,
.ai-panel .ai-failure-next-confirm:focus-visible {
  text-decoration: underline;
  outline: none;
}
.ai-panel .ai-pending-confirm.is-after-failure {
  border-left: 3px solid var(--color-accent);
}
.ai-panel .ai-pending-confirm.is-after-failure-focus {
  outline: 2px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
  outline-offset: 1px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 16%, transparent);
}
@container (max-width: 230px) {
  .ai-panel .ai-failure-next-confirm {
    display: block;
    width: 100%;
  }
}

"""
    # insert before R21 or after R21 failure block
    anchor = "/* R21 Round21: pinned failure evidence on reply card (S27) */"
    if anchor in css:
        css = css.replace(anchor, block + anchor, 1)
    else:
        css = css + "\n" + block
    css_path.write_text(css, encoding="utf-8")
    print("css added")
else:
    print("css already")

# --- 6) expand matrix with linked scene ---
matrix_path = ROOT / "scripts/ai-shot-matrix-r22.mjs"
matrix_path.write_text(
    r'''/** Round 22: R21 failure evidence screenshot matrix (wide/narrow × themes via harness).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 * Round 22 polish: optional nextConfirm links failure pin → pending dock.
 */
export const R22_AI_SHOT_NAMES = [
  'r22-failure-evidence',
  'r22-failure-evidence-narrow',
  'r22-failure-next-confirm'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r22AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectFail =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-retry]')&&document.querySelector('[data-testid=ai-failure-title]')&&document.querySelector('[data-testid=ai-exec-replay].has-failure-pin'))"
  const expectLink =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-next-confirm]')&&document.querySelector('[data-testid=ai-pending-confirm][data-after-failure=\"1\"]')&&document.querySelector('[data-testid=ai-pending-agree]'))"
  return [
    {
      name: 'r22-failure-evidence',
      wait: 1400,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r22-failure-evidence-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r22-failure-next-confirm',
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence', nextConfirm: 'systemctl restart nginx' }],
      expect: expectLink
    }
  ]
}
''',
    encoding="utf-8",
)
print("matrix expanded")

# update harness test
(ROOT / "scripts/test-r22-ai-shot-harness.ts").write_text(
    r'''/** R22: aiFailureEvidence wide/narrow + next-confirm link screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r22AiShots, R22_AI_SHOT_NAMES } from './ai-shot-matrix-r22.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r22AiShots()
assert.deepEqual(shots.map((s) => s.name), R22_AI_SHOT_NAMES, 'matrix names stable')
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const wide = shots.find((s) => s.name === 'r22-failure-evidence')
assert.ok(wide)
assert.notEqual(wide?.narrow, true)
assert.ok(wide?.steps?.some((st) => st.op === 'aiFailureEvidence'))
assert.ok(wide?.expect?.includes('ai-failure-evidence'))
assert.ok(wide?.expect?.includes('ai-failure-retry'))

const narrow = shots.find((s) => s.name === 'r22-failure-evidence-narrow')
assert.equal(narrow?.narrow, true)
assert.ok(narrow?.steps?.some((st) => st.op === 'aiFailureEvidence'))
assert.ok(narrow?.expect?.includes('has-failure-pin'))

const linked = shots.find((s) => s.name === 'r22-failure-next-confirm')
assert.ok(linked?.steps?.some((st) => st.op === 'aiFailureEvidence' && st.nextConfirm))
assert.ok(linked?.expect?.includes('ai-failure-next-confirm'))
assert.ok(linked?.expect?.includes('data-after-failure'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiFailureEvidence'))
assert.ok(hooks.includes('nextConfirm'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiFailureEvidence'"))
assert.ok(panel.includes('shot-r21-fail') || panel.includes('S27_FAIL_CMD'))
assert.ok(panel.includes('ai-failure-next-confirm'))
assert.ok(panel.includes('buildAuditOpenAiMissToast'))
assert.ok(panel.includes('data-after-failure'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiFailureEvidence'"))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r22.mjs'"))
assert.ok(har.includes('r22AiShots()'))

const er = norm('src/renderer/src/components/ExecReplay.tsx')
assert.ok(er.includes('data-testid="ai-failure-evidence"'))
assert.ok(er.includes('data-testid="ai-failure-retry"'))

console.log('test-r22-ai-shot-harness: ok', R22_AI_SHOT_NAMES.length)
''',
    encoding="utf-8",
)
print("harness test updated")

# --- 7) dedicated polish tests ---
(ROOT / "scripts/test-r22-failure-next-confirm.ts").write_text(
    r'''/** R22 polish: failure pin ↔ next confirm dock + audit miss calm toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAuditOpenAiMissToast, hasFailedExecPin } from '../src/shared/ai-audit-miss'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const miss = buildAuditOpenAiMissToast()
assert.equal(miss.kind, 'info')
assert.equal(miss.theme, 'info')
assert.ok(miss.ms >= 5000)
assert.equal(miss.messageKey, 'au2.openAiMiss')
assert.equal(miss.actionKey, 'au2.openAiMissAction')

assert.equal(hasFailedExecPin([]), false)
assert.equal(hasFailedExecPin([{ role: 'assistant', exec: { status: 'ok' } }]), false)
assert.equal(hasFailedExecPin([{ role: 'assistant', exec: { status: 'failed' } }]), true)

assert.ok(translate('zh-CN', 'au2.openAiMiss').includes('当前对话'))
assert.equal(translate('zh-CN', 'au2.openAiMissAction'), '回到顶部')
assert.equal(translate('zh-CN', 'fail.nextConfirm'), '下一步待确认')
assert.ok(translate('zh-CN', 'fail.nextConfirmTip').includes('不会静默'))
assert.equal(translate('en', 'au2.openAiMissAction'), 'Back to top')
assert.equal(translate('en', 'fail.nextConfirm'), 'Next confirm')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('buildAuditOpenAiMissToast'))
assert.ok(panel.includes("kind: miss.kind"))
assert.ok(panel.includes("tg(miss.actionKey)"))
assert.ok(panel.includes('data-testid="ai-failure-next-confirm"'))
assert.ok(panel.includes('data-after-failure='))
assert.ok(panel.includes('is-after-failure-focus'))
assert.ok(panel.includes('shot-r22-next'))
assert.ok(!/showToast\(tg\('au2\.openAiMiss'\)\s*\)/.test(panel), 'bare miss toast must use helper')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R22 Round22: failure→next-confirm'))
assert.ok(css.includes('.ai-panel .ai-failure-next-confirm'))
assert.ok(css.includes('.ai-panel .ai-pending-confirm.is-after-failure'))
const start = css.indexOf('R22 Round22: failure→next-confirm')
const end = css.indexOf('/* R21 Round21:', start)
const block = css.slice(start, end > start ? end : start + 2000)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R22 CSS')

const jump = norm('scripts/test-ai-jump-from-audit.ts')
assert.ok(jump.includes("au2.openAiMiss"))

console.log('test-r22-failure-next-confirm: ok')
''',
    encoding="utf-8",
)
print("polish test written")

# package.json wire polish test
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
parts = pkg["scripts"]["test:parts"]
needle = "npx tsx --tsconfig tsconfig.web.json scripts/test-r22-ai-shot-harness.ts"
add = needle + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r22-failure-next-confirm.ts"
if "test-r22-failure-next-confirm" not in parts:
    if needle not in parts:
        raise SystemExit("r22 harness anchor missing")
    pkg["scripts"]["test:parts"] = parts.replace(needle, add, 1)
    pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("package wired polish test")
else:
    print("package already")

# update README
readme = ROOT / "docs/screenshots/r22/README.md"
readme.write_text(
    """# Round 22 screenshots — failure evidence pin + next-confirm link

Captures the Round 21 S27 failure evidence card via declarative op `aiFailureEvidence`, plus Round 22 polish linking the pin to the next confirm dock.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r22-failure-evidence.png` | Failure pin wide | `ai-failure-evidence` + retry CTA + `has-failure-pin` |
| `*-r22-failure-evidence-narrow.png` | Failure pin narrow | same expects at narrow size |
| `*-r22-failure-next-confirm.png` | Failure + next dock | `ai-failure-next-confirm` + `data-after-failure=1` + Agree |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r22.mjs` (op `aiFailureEvidence`, optional `nextConfirm`).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r22 --set chrome --only r22-failure-evidence,r22-failure-evidence-narrow,r22-failure-next-confirm --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r22 --no-build --set chrome --only r22-failure-evidence,r22-failure-evidence-narrow,r22-failure-next-confirm --themes dark,light
```
""",
    encoding="utf-8",
)
print("README updated")
print("item2 patch applied")
