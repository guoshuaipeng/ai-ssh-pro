from pathlib import Path
p = Path("docs/dev-rules.md")
t = p.read_text(encoding="utf-8")
# remove dangling bullet
t = t.replace(
    "\n- 截图/shot handler 只用组件顶层 useState setter；禁止调用流式 handler 内局部函数（如 setTurnPending）。\n",
    "\n",
)
# merge into rule 12
old12 = "12. 截图集中做：开工时一次拍完改前截图，收尾时一次拍完改后截图（深色和浅色）；场景先补齐并单独提交，场景必须幂等；文件名不得重复，查看时复制成新文件名。（D） 每次截图后列出产物，核对「场景数 × 主题数」，并检查退出码；数量对不上视为失败。（c54 流程复盘）"
new12 = old12 + " 截图/shot handler 只用组件顶层 useState setter，禁止调用流式 handler 内局部函数（如 setTurnPending）。（R22）"
if old12 not in t:
    raise SystemExit("rule 12 not found")
if "R22" in t and "setTurnPending" in t and "12. 截图集中做" in t:
    # maybe already merged partially
    pass
t = t.replace(old12, new12, 1)
p.write_text(t, encoding="utf-8")
# verify count of numbered rules
import re
nums = re.findall(r"^(\d+)\. ", t, flags=re.M)
print("rules", nums)
assert nums == [str(i) for i in range(1,16)]
assert t.count("\n- ") == 0 or "来源" in t  # no dangling bullets ideally
print("ok, no extra bullet:", "- 截图/shot" not in t)
