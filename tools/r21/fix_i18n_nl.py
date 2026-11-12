# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\src\renderer\src\lib\i18n.tsx")
t = p.read_text(encoding="utf-8")
# Fix broken zh exhaustedAsk if split across lines
bad = "请换个问法或换命令（禁止自动重跑）：\\\n{evidence}"
# actual bad might be backslash then real newline then n
bad2 = "请换个问法或换命令（禁止自动重跑）：\\\nn{evidence}"
# read around the key
idx = t.find("'fail.exhaustedAsk'")
print("idx", idx)
print(repr(t[idx:idx+120]))
# fix common broken patterns
t2 = t.replace(
    "'fail.exhaustedAsk': '同一命令重试预算已用尽。请换个问法或换命令（禁止自动重跑）：\\\nn{evidence}'",
    "'fail.exhaustedAsk': '同一命令重试预算已用尽。请换个问法或换命令（禁止自动重跑）：\\n{evidence}'",
)
t2 = t2.replace(
    "'fail.exhaustedAsk': '同一命令重试预算已用尽。请换个问法或换命令（禁止自动重跑）：\\\n{evidence}'",
    "'fail.exhaustedAsk': '同一命令重试预算已用尽。请换个问法或换命令（禁止自动重跑）：\\n{evidence}'",
)
# Also check if it's literally backslash + newline + n
import re
t2 = re.sub(
    r"'fail\.exhaustedAsk': '同一命令重试预算已用尽。请换个问法或换命令（禁止自动重跑）：\\\s*\nn?\{evidence\}'",
    "'fail.exhaustedAsk': '同一命令重试预算已用尽。请换个问法或换命令（禁止自动重跑）：\\n{evidence}'",
    t2,
)
if t2 != t:
    p.write_text(t2, encoding="utf-8")
    print("fixed exhaustedAsk")
else:
    print("no change needed or pattern different")
    # show hex around
    print([hex(ord(c)) for c in t[idx:idx+100]])
