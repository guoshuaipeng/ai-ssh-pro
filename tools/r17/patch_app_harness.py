from pathlib import Path

# App.tsx — open AI pane for new ops
p = Path('src/renderer/src/App.tsx')
t = p.read_text(encoding='utf-8')
old = """        detail.op === 'aiError' ||
        detail.op === 'aiAccentStack'
      ) {"""
new = """        detail.op === 'aiError' ||
        detail.op === 'aiAccentStack' ||
        detail.op === 'aiAskProgress' ||
        detail.op === 'aiBatchSticky'
      ) {"""
if "detail.op === 'aiAskProgress'" not in t:
    if old not in t:
        raise SystemExit('App screenshot op list not found')
    t = t.replace(old, new, 1)
    p.write_text(t, encoding='utf-8')
    print('App shots ok')
else:
    print('App already')

# screenshot-key-screens.mjs — import + inject
h = Path('scripts/screenshot-key-screens.mjs')
ht = h.read_text(encoding='utf-8')
if 'ai-shot-matrix-r17' not in ht:
    old_imp = "import { r14AiShots } from './ai-shot-matrix-r14.mjs'\n"
    new_imp = "import { r14AiShots } from './ai-shot-matrix-r14.mjs'\nimport { r17AiShots } from './ai-shot-matrix-r17.mjs'\n"
    if old_imp not in ht:
        raise SystemExit('r14 import not found')
    ht = ht.replace(old_imp, new_imp, 1)

old_inj = """  // Round 14: standardized AI state matrix (declarative — see scripts/ai-shot-matrix-r14.mjs)
  ...${JSON.stringify(r14AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
new_inj = """  // Round 14: standardized AI state matrix (declarative — see scripts/ai-shot-matrix-r14.mjs)
  ...${JSON.stringify(r14AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 17: ask progress + sticky batch bar
  ...${JSON.stringify(r17AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
if 'r17AiShots()' not in ht:
    if old_inj not in ht:
        raise SystemExit('r14 inject block not found')
    ht = ht.replace(old_inj, new_inj, 1)
h.write_text(ht, encoding='utf-8')
print('harness ok')
