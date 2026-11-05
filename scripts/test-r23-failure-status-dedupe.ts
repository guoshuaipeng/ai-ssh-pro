/** R23: dedupe failure pin vs ExecReplay 「失败 · exit」 status. */
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
