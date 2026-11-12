from pathlib import Path
import re
t = Path('src/renderer/src/lib/i18n.tsx').read_text(encoding='utf-8')
for m in re.finditer(r"'au2\.(openAi|openAiTip|openAiMiss|capped)':[^\n]+", t):
    print(m.group(0))
