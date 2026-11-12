from pathlib import Path
p = Path("docs/dev-rules.md")
t = p.read_text(encoding="utf-8")
old = "14. 每 3 轮做一次全页面视觉审查（用拼图查看），结果写入 backlog 并排序。"
new = "14. 每 3 轮做一次全页面视觉审查（用拼图查看），结果写入 backlog 并排序；可修的 P1/P2 当场修。AI 待确认相关表面（进度芯片、确认坞、可确认卡徽章、失败→下一步）必须共用 `alignPlanStepDisplay`，改 wiring 同步旧 R16/R18 断言。（R24）"
if "alignPlanStepDisplay" in t:
    print("rule already")
elif old not in t:
    raise SystemExit("rule 14 missing")
else:
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("dev-rules: merged into 14")
