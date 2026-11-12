# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\src\renderer\src\components\AIPanel.tsx")
t = p.read_text(encoding="utf-8")
t2 = t.replace(
    "  )\n\n    const retryLastUser = useCallback(() => {\n",
    "  )\n\n  const retryLastUser = useCallback(() => {\n",
    1,
)
if t2 == t:
    raise SystemExit('indent fix missed')
p.write_text(t2, encoding='utf-8')
print('indent fixed')
