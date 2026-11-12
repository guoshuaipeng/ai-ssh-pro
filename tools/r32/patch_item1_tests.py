# -*- coding: utf-8 -*-
"""R32 item1 tests + update R22/jump asserts for New chat action."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

def write(path: Path, text: str):
    path.write_text(text.replace("\r\n", "\n"), encoding="utf-8", newline="\n")

# Update R22 asserts
r22 = ROOT / "scripts/test-r22-failure-next-confirm.ts"
t = r22.read_text(encoding="utf-8")
t2 = t.replace(
    "assert.equal(translate('zh-CN', 'au2.openAiMissAction'), '回到顶部')",
    "assert.equal(translate('zh-CN', 'au2.openAiMissAction'), '新开对话')",
)
t2 = t2.replace(
    "assert.equal(translate('en', 'au2.openAiMissAction'), 'Back to top')",
    "assert.equal(translate('en', 'au2.openAiMissAction'), 'New chat')",
)
if t2 == t:
    raise SystemExit("r22 action asserts not updated")
# Also soft-check message mentions 新开
if "assert.ok(translate('zh-CN', 'au2.openAiMiss').includes('当前对话'))" in t2:
    t2 = t2.replace(
        "assert.ok(translate('zh-CN', 'au2.openAiMiss').includes('当前对话'))",
        "assert.ok(translate('zh-CN', 'au2.openAiMiss').includes('当前对话'))\n"
        "assert.ok(translate('zh-CN', 'au2.openAiMiss').includes('新开对话'))",
    )
write(r22, t2)
print("updated test-r22")

# New dedicated R32 test
write(ROOT / "scripts/test-r32-audit-miss-new-chat.ts", """/** R32: audit→AI miss toast recovers via New chat (no fabricated history). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAuditOpenAiMissToast } from '../src/shared/ai-audit-miss'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

const miss = buildAuditOpenAiMissToast()
assert.equal(miss.kind, 'info')
assert.equal(miss.theme, 'info')
assert.equal(miss.messageKey, 'au2.openAiMiss')
assert.equal(miss.actionKey, 'au2.openAiMissAction')

assert.equal(translate('zh-CN', 'au2.openAiMissAction'), '新开对话')
assert.equal(translate('en', 'au2.openAiMissAction'), 'New chat')
assert.ok(translate('zh-CN', 'au2.openAiMiss').includes('新开对话'))
assert.ok(translate('zh-CN', 'au2.openAiMiss').includes('不会编造'))
assert.ok(translate('en', 'au2.openAiMiss').toLowerCase().includes('new chat'))
assert.ok(translate('en', 'au2.openAiMiss').includes('not invented') || translate('en', 'au2.openAiMiss').includes('history'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('startNewChatRef'))
assert.ok(panel.includes('startNewChatRef.current = startNewChat'))
assert.ok(panel.includes('startNewChatRef.current?.()'))
assert.ok(panel.includes('Round 32: calm info toast + New chat'))
assert.ok(!panel.includes(\"scrollTo({ top: 0, behavior: 'smooth' })\") || panel.includes('startNewChatRef.current?.()'))
// Miss path must not keep Back-to-top scroll as the toast action
const missIdx = panel.indexOf('Round 32: calm info toast + New chat')
assert.ok(missIdx >= 0)
const missSlice = panel.slice(missIdx, missIdx + 700)
assert.ok(missSlice.includes('startNewChatRef.current?.()'))
assert.equal(missSlice.includes('scrollTo({ top: 0'), false, 'miss toast action must not scroll-to-top')

const shared = norm('src/shared/ai-audit-miss.ts')
assert.ok(shared.includes('Round 22/32'))
assert.ok(shared.includes('new chat'))

console.log('test-r32-audit-miss-new-chat: ok')
""")
print("wrote test-r32-audit-miss-new-chat.ts")
print("item1 tests ok")
