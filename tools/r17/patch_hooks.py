from pathlib import Path

# --- screenshot-hooks.ts ---
p = Path('src/renderer/src/lib/screenshot-hooks.ts')
t = p.read_text(encoding='utf-8')
old = """  /** Round 14: streaming + cancelled + error stacked for accent QA. */
  | { op: \"aiAccentStack\" }
"""
new = """  /** Round 14: streaming + cancelled + error stacked for accent QA. */
  | { op: \"aiAccentStack\" }
  /** Round 17: ask-policy plan progress chip + active plan step badge. */
  | { op: \"aiAskProgress\"; step?: number; max?: number; preview?: string }
  /** Round 17: sticky batch bar with >=2 suggestion commands. */
  | { op: \"aiBatchSticky\" }
"""
if 'aiAskProgress' not in t:
    if old not in t:
        raise SystemExit('aiAccentStack type not found')
    t = t.replace(old, new, 1)
    p.write_text(t, encoding='utf-8')
    print('hooks ok')
else:
    print('hooks already')
