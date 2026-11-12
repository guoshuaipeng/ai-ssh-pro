from pathlib import Path
p = Path("docs/dev-rules.md")
t = p.read_text(encoding="utf-8")
old = "AI 待确认相关表面（进度芯片、确认坞、可确认卡徽章、失败→下一步）必须共用 `alignPlanStepDisplay`，改 wiring 同步旧 R16/R18 断言。（R24）"
new = "AI 待确认相关表面（进度芯片、确认坞、可确认卡徽章、失败→下一步）必须共用 `alignPlanStepDisplay`，改 wiring 同步旧 R16/R18 断言。（R24）新增 shared helper 用于 JSX 时，守卫须断言 `import { … helper … } from`，不能只 grep 标识符。（R25）"
if "不能只 grep 标识符" in t:
    print("already")
elif old not in t:
    raise SystemExit("rule 14 needle missing")
else:
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("dev-rules: R25 merged into #14")
