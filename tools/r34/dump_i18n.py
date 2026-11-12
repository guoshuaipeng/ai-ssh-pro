from pathlib import Path
i18n = Path('src/renderer/src/lib/i18n.tsx').read_text(encoding='utf-8')
# extract policy-related keys
import re
for m in re.finditer(r"['\"]policy\.[^'\"]+['\"]\s*:\s*['\"][^'\"]*['\"]", i18n):
    print(m.group(0))
print('---SHORT---')
for m in re.finditer(r"['\"][^'\"]*(?:chip|short|Ask|Suggest|Auto|需确认|仅建议|自动)[^'\"]*['\"]\s*:\s*['\"][^'\"]*['\"]", i18n):
    s=m.group(0)
    if 'policy' in s or 'chip' in s.lower() or '需确认' in s or '仅建议' in s or 'Ask' in s:
        print(s)