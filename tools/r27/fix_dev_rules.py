# -*- coding: utf-8 -*-
from pathlib import Path
p = Path("docs/dev-rules.md")
t = p.read_text(encoding="utf-8")
# remove stray 16th dash
t = t.replace("\n- 截图深链（jump-audit 等）必须 seed 匹配数据，或显式断言 empty/filter-empty；禁止空库冒充命中。\n", "\n")
t = t.replace("\n- 截图深链（jump-audit 等）必须 seed 匹配数据，或显式断言 empty/filter-empty；禁止空库冒充命中。", "")
# merge into rule 14
old = "14. 每 3 轮做一次全页面视觉审查（用拼图查看），结果写入 backlog 并排序；可修的 P1/P2 当场修。AI 待确认相关表面（进度芯片、确认坞、可确认卡徽章、失败→下一步）必须共用 `alignPlanStepDisplay`，改 wiring 同步旧 R16/R18 断言。（R24）新增 shared helper 用于 JSX 时，守卫须断言 `import { … helper … } from`，不能只 grep 标识符。（R25）"
new = "14. 每 3 轮做一次全页面视觉审查（用拼图查看），结果写入 backlog 并排序；可修的 P1/P2 当场修。AI 待确认相关表面（进度芯片、确认坞、可确认卡徽章、失败→下一步）必须共用 `alignPlanStepDisplay`，改 wiring 同步旧 R16/R18 断言。（R24）新增 shared helper 用于 JSX 时，守卫须断言 `import { … helper … } from`，不能只 grep 标识符。（R25）截图深链（jump-audit 等）必须 seed 匹配数据，或显式断言 empty/filter-empty；禁止空库冒充命中。（R27）"
if "（R27）" not in t:
    if old not in t:
        raise SystemExit("rule 14 missing")
    t = t.replace(old, new, 1)
p.write_text(t, encoding="utf-8")
print("merged into 14; trailing dash gone", "- 截图深链" not in p.read_text(encoding="utf-8"))
