from pathlib import Path
bt = Path("docs/backlog.md").read_text(encoding="utf-8")
# mark done rows in R21 audit table
bt2 = bt.replace(
    "| P2 | 失败证据卡为本轮新态，矩阵尚未收录 `aiFailureEvidence` 宽/窄×深/浅 | Round 22 扩 harness → `docs/screenshots/r22/` |",
    "| ~~P2~~ | ~~失败证据卡矩阵尚未收录~~ | ✅ Round 22 `docs/screenshots/r22/` |",
)
bt2 = bt2.replace(
    "| P2 | 审计「对话」无匹配仍仅 toast（R17） | 弱提示「在当前主机新开对话」，不造历史 |",
    "| ~~P2~~ | ~~审计「对话」无匹配仍仅 toast（R17）~~ | ✅ Round 22 calm info +「回到顶部」（不造历史） |",
)
Path("docs/backlog.md").write_text(bt2, encoding="utf-8")
print("backlog marks updated")

# promote rule if not present
rules = Path("docs/dev-rules.md")
rt = rules.read_text(encoding="utf-8") if rules.exists() else ""
rule = "截图/shot handler 只用组件顶层 useState setter；禁止调用流式 handler 内局部函数（如 setTurnPending）。"
if "setTurnPending" not in rt and "shot handler" not in rt.lower() and "截图" not in rt:
    # keep <=15 rules — append carefully
    if rt.strip():
        rules.write_text(rt.rstrip() + "\n\n- " + rule + "\n", encoding="utf-8")
    else:
        rules.write_text("# Dev rules\n\n- " + rule + "\n", encoding="utf-8")
    print("dev-rules appended")
elif rule[:20] in rt or "shot handler" in rt or "截图/shot" in rt:
    print("dev-rules already has similar")
else:
    # count bullets
    n = rt.count("\n- ")
    if n < 15:
        rules.write_text(rt.rstrip() + "\n- " + rule + "\n", encoding="utf-8")
        print("dev-rules appended n=", n)
    else:
        print("dev-rules full, skip; n=", n)
