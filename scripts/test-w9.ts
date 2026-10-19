/** W9 soft-start: read-only built-in snippets and sample playbooks, save-as, no auto-run. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BUILTIN_SNIPPETS,
  builtinOpenPlan,
  builtinSnippetById,
  isBuiltinSnippetId,
  librarySeg,
  localizeBuiltin,
  pickBi,
  saveAsSnippet,
  stripBuiltinSnippets
} from '../src/shared/builtin-pack'
import { applyShareImport, type SharePlaybook } from '../src/shared/playbook-share'
import {
  isBuiltinPlaybookId,
  loadPlaybooks,
  partitionStoredPlaybooks,
  resolvePlaybook,
  samplePlaybooks,
  saveAsPlaybook,
  savePlaybooks,
  upsertPlaybook
} from '../src/shared/playbook'
import { mergeSnippetsImport } from '../src/shared/workspace-features'
import { paletteMatch } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS } from '../src/shared/menus'
import { translate } from '../src/renderer/src/lib/i18n'

function effectBodies(src: string): string[] {
  const out: string[] = []
  const re = /useEffect\(\(\) => \{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(src))) {
    let index = match.index + match[0].length
    let depth = 1
    while (index < src.length && depth > 0) {
      const ch = src[index]
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      index += 1
    }
    out.push(src.slice(match.index, index))
  }
  return out
}

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.41')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-w9\.ts/)

assert.ok(BUILTIN_SNIPPETS.length >= 1, 'W9-1 shipped snippets')
for (const row of BUILTIN_SNIPPETS) {
  assert.equal(row.builtin, true)
  assert.ok(isBuiltinSnippetId(row.id))
  assert.ok(pickBi(row.title, 'zh-CN').trim() && pickBi(row.summary, 'zh-CN').trim() && row.body.trim())
  assert.ok(pickBi(row.title, 'en').trim() && pickBi(row.summary, 'en').trim())
  assert.notEqual(pickBi(row.title, 'zh-CN'), pickBi(row.title, 'en'))
  assert.equal(builtinSnippetById(row.id)?.body, row.body)
}

const samples = samplePlaybooks()
assert.ok(samples.length >= 1, 'W9-2 shipped playbooks')
for (const playbook of samples) {
  assert.equal(playbook.builtin, true)
  assert.equal(isBuiltinPlaybookId(playbook.id), true)
  assert.ok(playbook.steps.length >= 1)
  assert.match(playbook.description, /不自动执行/)
  assert.equal(resolvePlaybook(playbook.id, []).id, playbook.id)
  assert.equal(resolvePlaybook(playbook.id, [])?.steps[0]?.command, playbook.steps[0]?.command)
}

const packed = JSON.stringify(BUILTIN_SNIPPETS) + JSON.stringify(samples)
assert.equal(/password|passwd|private key|BEGIN |token|rm\s+-rf|reboot|shutdown/i.test(packed), false)

const disk = BUILTIN_SNIPPETS[0]!
const snippetCopy = saveAsSnippet(disk, () => 'user-snip-1', '我的磁盘')
assert.equal(snippetCopy.id, 'user-snip-1')
assert.equal(snippetCopy.title, '我的磁盘')
assert.equal(snippetCopy.body, disk.body)
assert.equal(disk.id, 'builtin:snip:disk')
assert.equal(pickBi(disk.title, 'zh-CN'), '查看磁盘')
assert.equal(pickBi(disk.title, 'en'), 'Check disk')
assert.equal(localizeBuiltin(disk, 'en').title, 'Check disk')
assert.deepEqual(stripBuiltinSnippets([disk, snippetCopy]).map((row) => row.id), ['user-snip-1'])

const playbookCopy = saveAsPlaybook(samples[0]!, 50, '磁盘副本')
assert.equal(playbookCopy.id, 'pb-50')
assert.equal(isBuiltinPlaybookId(playbookCopy.id), false)
assert.equal(playbookCopy.builtin, undefined)
assert.equal(playbookCopy.name, '磁盘副本')
assert.equal(playbookCopy.steps[0]?.command, samples[0]!.steps[0]?.command)
assert.notEqual(playbookCopy.steps[0]?.id, samples[0]!.steps[0]?.id)
assert.deepEqual(upsertPlaybook([playbookCopy], samples[0]!).map((row) => row.id), [playbookCopy.id])

const seeded = partitionStoredPlaybooks(samples, 80)
assert.equal(seeded.user.length, 0, 'unchanged built-in seeds are not user copies')
const edited = { ...samples[0]!, steps: samples[0]!.steps.map((step, index) => (index === 0 ? { ...step, command: 'df -hT' } : step)) }
const migrated = partitionStoredPlaybooks([edited, playbookCopy], 90)
assert.equal(migrated.user.some((row) => row.id === 'sample-disk'), false)
assert.ok(migrated.user.some((row) => row.steps.some((step) => step.command === 'df -hT')))
assert.ok(migrated.user.some((row) => row.id === playbookCopy.id))
assert.equal(samplePlaybooks()[0]!.steps[0]!.command, 'df -h')

const mem = new Map<string, string>()
const store = { getItem: (key: string) => mem.get(key) ?? null, setItem: (key: string, value: string) => void mem.set(key, value) }
savePlaybooks([samples[0]!, playbookCopy], store)
const stored = loadPlaybooks(store)
assert.equal(stored.some((row) => row.id === 'sample-disk'), false)
assert.equal(stored.some((row) => row.id === playbookCopy.id), true)
assert.equal(samplePlaybooks()[0]!.steps[0]!.command, 'df -h')

const incoming: SharePlaybook[] = [{
  id: 'sample-disk',
  name: samples[0]!.name,
  description: 'imported',
  steps: [{ id: 'x', type: 'command', command: 'echo hacked', confirm: false, stopOnError: true, timeoutSec: 30 }]
}]
const applied = applyShareImport(samples, incoming, 'overwrite', ' 副本', 1000)
const kept = applied.list.find((row) => row.id === 'sample-disk')
assert.equal(kept?.steps[0]?.command, 'df -h', 'W9-7 import does not overwrite the built-in id')
assert.ok(applied.list.some((row) => !isBuiltinPlaybookId(row.id) && row.steps.some((step) => step.command === 'echo hacked')))
savePlaybooks(applied.list, store)
assert.equal(loadPlaybooks(store).some((row) => row.id === 'sample-disk'), false)
assert.equal(resolvePlaybook('sample-disk')?.steps[0]?.command, 'df -h')

const merged = mergeSnippetsImport([], JSON.stringify({ snippets: [{ id: disk.id, title: '自定义', body: 'uptime' }] }), () => 'user-2')
assert.ok(merged)
assert.equal(merged!.list[0]?.id, 'user-2')
assert.equal(BUILTIN_SNIPPETS[0]!.body, 'df -h')

const rows = [
  ...BUILTIN_SNIPPETS.map((row) => ({ builtin: true as const, id: row.id })),
  { builtin: false as const, id: 'user' }
]
assert.deepEqual(librarySeg(rows, 'builtin').map((row) => row.id), BUILTIN_SNIPPETS.map((row) => row.id))
assert.deepEqual(librarySeg(rows, 'mine').map((row) => row.id), ['user'])
assert.equal(librarySeg(rows, 'all').length, rows.length)

assert.deepEqual(builtinOpenPlan(), { remote: false, skipsConfirm: false, runs: false })

const snippetsUi = readFileSync('src/renderer/src/components/SnippetsPanel.tsx', 'utf8')
const playbooksUi = readFileSync('src/renderer/src/components/PlaybookTabs.tsx', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/styles-m2.css', 'utf8')
const storeSrc = readFileSync('src/main/app-store.ts', 'utf8')
const changelog = readFileSync('CHANGELOG.md', 'utf8')

assert.ok(snippetsUi.includes('data-testid="w9-snip-preview"'))
assert.ok(snippetsUi.includes('data-testid="w9-snip-save-as"'))
assert.ok(snippetsUi.includes('w9-try-snippet'))
assert.ok(snippetsUi.includes('onDoubleClick={() => setPreviewId(s.id)}'))
assert.ok(effectBodies(snippetsUi).every((body) => !body.includes('dispatchInjectTerminal')))
assert.ok(snippetsUi.includes('stripBuiltinSnippets'))
assert.ok(storeSrc.includes("id.startsWith('builtin:snip:')"))

assert.ok(playbooksUi.includes('data-testid="w9-playbook-locked"'))
assert.ok(playbooksUi.includes('w9-try-playbook'))
assert.ok(playbooksUi.includes('data-auto-run="false"'))
assert.ok(playbooksUi.includes('readOnly={locked}'))
assert.ok(playbooksUi.includes('isBuiltinPlaybookId(playbook.id)'))
assert.ok(playbooksUi.includes('askConfirm('))
assert.ok(playbooksUi.includes('data-testid="w2-dry"'))
assert.ok(effectBodies(playbooksUi).every((body) => !body.includes('ssh.exec') && !body.includes('runPlaybook(')))
assert.equal(playbooksUi.includes('<Modal'), false)

assert.ok(app.includes("action === 'builtinSnippets'"))
assert.ok(app.includes("action === 'builtinPlaybooks'"))
assert.ok(app.includes('previewBuiltin: true'))
assert.equal(toolbar.includes('w9.'), false)
assert.equal(toolbar.includes('builtinSnippets'), false)
assert.equal(toolbar.includes('builtinPlaybooks'), false)

const menuIds = SHARED_MENUS.flatMap((menu) => menu.items.filter((item) => item.type === 'item').map((item) => item.id))
const ops = SHARED_MENUS.find((m) => m.id === 'ops')!
const hiddenId = (id) => {
  const hit = ops.items.find((it) => it.type === 'item' && it.id === id)
  return hit && hit.type === 'item' ? hit.menuHidden === true : false
}
assert.equal(menuIds.includes('builtinSnippets'), true)
assert.equal(menuIds.includes('builtinPlaybooks'), true)
assert.equal(hiddenId('builtinSnippets'), true)
assert.equal(hiddenId('builtinPlaybooks'), true)
assert.ok(paletteMatch('内置片段', 'zh-CN').includes('builtinSnippets'))
assert.ok(paletteMatch('built-in sample', 'en').includes('builtinPlaybooks'))

assert.match(styles, /\.w9-seg\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.w9-row-actions\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.w9-steps\s*\{[^}]*flex-wrap:\s*nowrap/)

assert.equal(zh('w9.builtin'), '内置')
assert.equal(en('w9.builtin'), 'Built-in')
assert.equal(zh('w9.saveAs'), '另存为')
assert.equal(zh('w9.try'), '试试内置示例')
assert.match(zh('w9.sampleNoAuto'), /不自动执行/)
assert.ok(en('w9.tryHint').length > 0)

const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
const order = ['Polish-3', 'A-TFL', 'L9', 'A-OM', 'L10', 'A6', 'W9']
let at = -1
for (const mark of order) {
  const next = unreleased.indexOf(mark)
  assert.ok(next > at, `${mark} stays in Unreleased order`)
  at = next
}
assert.ok(unreleased.includes('S4') && unreleased.includes('A-HITL') && unreleased.includes('不自动执行'))
assert.equal(pkg.version, '0.6.41')

console.log('test-w9 ok')
