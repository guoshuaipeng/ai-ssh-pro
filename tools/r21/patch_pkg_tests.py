# -*- coding: utf-8 -*-
from pathlib import Path
import json

pkg = Path(r"E:\pythonProjects\ai-ssh-pro\package.json")
# package.json may be large - do string replace on test:parts
t = pkg.read_text(encoding="utf-8")
needle = 'scripts/test-r20-ai-shot-harness.ts"'
insert = 'scripts/test-r20-ai-shot-harness.ts && npx tsx --tsconfig tsconfig.web.json scripts/test-r21-failure-evidence.ts && npx tsx --tsconfig tsconfig.web.json scripts/test-r21-memory-chip-narrow.ts"'
if 'test-r21-failure-evidence' not in t:
    if needle not in t:
        raise SystemExit('package.json needle missing')
    t = t.replace(needle, insert, 1)
    pkg.write_text(t, encoding='utf-8')
    print('package.json updated')
else:
    print('package.json already')

# update test-exec-replay normalize assertion to allow failure fields path
rep = Path(r"E:\pythonProjects\ai-ssh-pro\scripts\test-exec-replay.ts")
rt = rep.read_text(encoding='utf-8')
if 'failureKind' not in rt:
    old = """assert.deepEqual(normalizeExecRecord({ status: 'failed', at: 5, durationMs: 12.6, exitCode: 1, summary: 'x', outputLines: 1, auditId: ' aud-1 ', extra: 1 }), { status: 'failed', at: 5, durationMs: 13, exitCode: 1, summary: 'x', outputLines: 1, auditId: 'aud-1' })
"""
    new = """assert.deepEqual(normalizeExecRecord({ status: 'failed', at: 5, durationMs: 12.6, exitCode: 1, summary: 'x', outputLines: 1, auditId: ' aud-1 ', extra: 1 }), { status: 'failed', at: 5, durationMs: 13, exitCode: 1, summary: 'x', outputLines: 1, auditId: 'aud-1' })
assert.deepEqual(
  normalizeExecRecord({
    status: 'failed',
    at: 9,
    exitCode: 1,
    failureKind: 'nonzero',
    evidence: 'command=x\\nexit=1',
    retryBudget: { count: 1, cap: 2, exhausted: false }
  }),
  {
    status: 'failed',
    at: 9,
    exitCode: 1,
    failureKind: 'nonzero',
    evidence: 'command=x\\nexit=1',
    retryBudget: { count: 1, cap: 2, exhausted: false }
  }
)
assert.ok(rt.includes("failureKind: failure.kind") or True)
"""
    # simpler append before console.log
    if old not in rt:
        raise SystemExit('exec-replay assert missing')
    # Don't add broken assert.ok with rt - fix
    new = """assert.deepEqual(normalizeExecRecord({ status: 'failed', at: 5, durationMs: 12.6, exitCode: 1, summary: 'x', outputLines: 1, auditId: ' aud-1 ', extra: 1 }), { status: 'failed', at: 5, durationMs: 13, exitCode: 1, summary: 'x', outputLines: 1, auditId: 'aud-1' })
assert.deepEqual(
  normalizeExecRecord({
    status: 'failed',
    at: 9,
    exitCode: 1,
    failureKind: 'nonzero',
    evidence: 'command=x\\nexit=1',
    retryBudget: { count: 1, cap: 2, exhausted: false }
  }),
  {
    status: 'failed',
    at: 9,
    exitCode: 1,
    failureKind: 'nonzero',
    evidence: 'command=x\\nexit=1',
    retryBudget: { count: 1, cap: 2, exhausted: false }
  }
)
"""
    new = new.replace('\\\\n', '\\n')
    rt = rt.replace(old, new, 1)
    # also assert agent emits failureKind
    rt = rt.replace(
        "assert.ok(main.includes(\"type: 'exec', requestId, command: oneLineCmd, payload: { status: 'blocked'\"))",
        "assert.ok(main.includes(\"type: 'exec', requestId, command: oneLineCmd, payload: { status: 'blocked'\"))\n  assert.ok(main.includes('failureKind: failure.kind'))",
        1,
    )
    rep.write_text(rt, encoding='utf-8')
    print('test-exec-replay updated')
else:
    print('exec-replay already')
