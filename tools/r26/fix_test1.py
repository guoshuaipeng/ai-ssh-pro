# -*- coding: utf-8 -*-
from pathlib import Path
p = Path("scripts/test-r26-ai-shot-harness.ts")
t = p.read_text(encoding="utf-8")
old = """assert.ok(collapsed?.expect?.includes(\"aria-expanded')==='false'\") || collapsed?.expect?.includes('aria-expanded')==='false'))
assert.ok(collapsed?.expect?.includes('!document.querySelector(\\'[data-testid=ai-memory-pop]\\')') || collapsed?.expect?.includes('ai-memory-pop'))
"""
new = """assert.ok(collapsed?.expect?.includes(\"aria-expanded\") && collapsed?.expect?.includes(\"false\"))
assert.ok(collapsed?.expect?.includes('ai-memory-pop'))
assert.ok(collapsed?.expect?.includes('ai-memory-count'))
"""
if old not in t:
    # try already-fixed or alternate
    if "ai-memory-count" in t and "aria-expanded" in t:
        print("test asserts already ok-ish")
    else:
        raise SystemExit("test assert block missing")
else:
    t = t.replace(old, new, 1)
    p.write_text(t, encoding="utf-8")
    print("test asserts fixed")
