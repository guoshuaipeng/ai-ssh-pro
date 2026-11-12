# -*- coding: utf-8 -*-
"""R23 item1: dedupe failure pin vs ExecReplay status line."""
from pathlib import Path

ROOT = Path('.')

def norm(p: Path) -> str:
    return p.read_text(encoding='utf-8').replace('\r\n', '\n')

def write(p: Path, s: str) -> None:
    p.write_text(s.replace('\n', '\r\n') if False else s, encoding='utf-8', newline='\n')

# --- ExecReplay.tsx ---
er_path = ROOT / 'src/renderer/src/components/ExecReplay.tsx'
er = norm(er_path)
old_status = """  const statusLabel = tg(`exec.status.${exec.status}` as 'exec.status.ok')
  const statusText =
    exec.status === 'failed' && typeof exec.exitCode === 'number' ? `${statusLabel} · ${tg('exec.exit', { code: exec.exitCode })}` : statusLabel
  const canJump = Boolean(exec.auditId || host || (command && command.trim()))
  const auditTip = exec.auditId ? tg('exec.auditTip') : canJump ? tg('exec.auditFilterTip') : tg('exec.auditMissing')
  const failureView = buildFailureEvidenceView(exec, command)"""
new_status = """  const failureView = buildFailureEvidenceView(exec, command)
  const statusLabel = tg(`exec.status.${exec.status}` as 'exec.status.ok')
  // Round 23: when the failure pin owns the story, do not re-shout 「失败 · exit」.
  const statusText = failureView
    ? tg('fail.statusQuiet')
    : exec.status === 'failed' && typeof exec.exitCode === 'number'
      ? `${statusLabel} · ${tg('exec.exit', { code: exec.exitCode })}`
      : statusLabel
  const canJump = Boolean(exec.auditId || host || (command && command.trim()))
  const auditTip = exec.auditId ? tg('exec.auditTip') : canJump ? tg('exec.auditFilterTip') : tg('exec.auditMissing')"""
if old_status not in er:
    raise SystemExit('ExecReplay status block not found')
er = er.replace(old_status, new_status, 1)

old_row_audit = """        <button
          type="button"
          className={`ai-exec-audit${canJump ? '' : ' is-muted'}`}
          data-testid="ai-exec-audit"
          aria-disabled={canJump ? undefined : true}
          title={auditTip}
          onClick={openAudit}
        >
          <Icon name="scroll-text" size={12} />
          <span>{tg('exec.audit')}</span>
        </button>
      </div>"""
new_row_audit = """        {failureView ? null : (
          <button
            type="button"
            className={`ai-exec-audit${canJump ? '' : ' is-muted'}`}
            data-testid="ai-exec-audit"
            aria-disabled={canJump ? undefined : true}
            title={auditTip}
            onClick={openAudit}
          >
            <Icon name="scroll-text" size={12} />
            <span>{tg('exec.audit')}</span>
          </button>
        )}
      </div>"""
if old_row_audit not in er:
    raise SystemExit('ExecReplay row audit block not found')
er = er.replace(old_row_audit, new_row_audit, 1)

# Add data attribute for tests
er = er.replace(
    'data-testid="ai-exec-replay" data-status={exec.status}',
    'data-testid="ai-exec-replay" data-status={exec.status} data-failure-deduped={failureView ? \'1\' : undefined}',
    1,
)
write(er_path, er)

# --- i18n ---
i18n_path = ROOT / 'src/renderer/src/lib/i18n.tsx'
i18n = norm(i18n_path)
zh_needle = "  'fail.title': '命令失败',\n"
zh_insert = "  'fail.title': '命令失败',\n  'fail.statusQuiet': '执行输出',\n"
if "'fail.statusQuiet'" not in i18n:
    if zh_needle not in i18n:
        raise SystemExit('zh fail.title missing')
    i18n = i18n.replace(zh_needle, zh_insert, 1)
en_needle = "  'fail.title': 'Command failed',\n"
en_insert = "  'fail.title': 'Command failed',\n  'fail.statusQuiet': 'Run output',\n"
if i18n.count("'fail.statusQuiet'") < 2:
    if en_needle not in i18n:
        raise SystemExit('en fail.title missing')
    i18n = i18n.replace(en_needle, en_insert, 1)
write(i18n_path, i18n)

# --- CSS: insert R23 block before R22 ---
css_path = ROOT / 'src/renderer/src/styles.css'
css = norm(css_path)
r23 = """/* R23 Round23: one calm failure story — pin owns failure; ExecReplay row stays quiet */
.ai-exec-replay.has-failure-pin .ai-exec-status {
  color: var(--color-text-muted);
  font-weight: 400;
}
.ai-exec-replay.has-failure-pin .ai-exec-dot {
  background: var(--color-text-muted);
}
.ai-exec-replay.has-failure-pin.is-failed .ai-exec-status {
  color: var(--color-text-muted);
}
.ai-exec-replay.has-failure-pin .ai-exec-row {
  opacity: 0.92;
}

"""
marker = '/* R22 Round22: failure→next-confirm link + after-failure dock */'
if 'R23 Round23: one calm failure story' not in css:
    if marker not in css:
        raise SystemExit('R22 CSS marker missing')
    css = css.replace(marker, r23 + marker, 1)
write(css_path, css)

# --- test ---
test = r'''/** R23: dedupe failure pin vs ExecReplay 「失败 · exit」 status. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(translate('zh-CN', 'fail.statusQuiet'), '执行输出')
assert.equal(translate('en', 'fail.statusQuiet'), 'Run output')
assert.equal(translate('zh-CN', 'fail.title'), '命令失败')
assert.equal(translate('zh-CN', 'exec.status.failed'), '失败')

const er = norm('src/renderer/src/components/ExecReplay.tsx')
assert.ok(er.includes("tg('fail.statusQuiet')"), 'quiet status when pin present')
assert.ok(er.includes('data-failure-deduped={failureView ?'), 'dedupe attribute')
assert.ok(er.includes('failureView ? null : ('), 'hide row audit when pin owns CTA')
assert.ok(
  er.indexOf('const failureView = buildFailureEvidenceView') < er.indexOf('const statusText'),
  'failureView before statusText'
)
// Without pin, failed + exit still uses statusLabel · exit
assert.ok(er.includes("tg('exec.exit', { code: exec.exitCode })"))
assert.ok(!/fail\.title[\s\S]{0,40}exec\.status\.failed/.test(er.slice(er.indexOf('statusText'), er.indexOf('statusText') + 400)))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R23 Round23: one calm failure story'))
assert.ok(css.includes('.ai-exec-replay.has-failure-pin .ai-exec-status'))
const start = css.indexOf('R23 Round23: one calm failure story')
const end = css.indexOf('/* R22 Round22:', start)
const block = css.slice(start, end > start ? end : start + 1200)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R23 CSS')

const i18n = norm('src/renderer/src/lib/i18n.tsx')
assert.equal(i18n.split("'fail.statusQuiet':").length - 1, 2, 'zh+en keys')

console.log('test-r23-failure-status-dedupe: ok')
'''
(ROOT / 'scripts/test-r23-failure-status-dedupe.ts').write_text(test, encoding='utf-8', newline='\n')
print('item1 patch ok')
