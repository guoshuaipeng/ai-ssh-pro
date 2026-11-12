from pathlib import Path
# how does harness inject r33 shots? find r33AiShots usage and toasts flag
har = Path('scripts/screenshot-key-screens.mjs').read_text(encoding='utf-8')
for needle in ["ai-shot-matrix-r33", "r33AiShots", "toasts:", "ai-shot-matrix-r26", "r26AiShots", "chrome"]:
    i=har.find(needle)
    print('===', needle, i)
    if i>=0: print(har[max(0,i-120):i+350])