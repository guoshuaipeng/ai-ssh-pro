from pathlib import Path
p = Path("docs/backlog.md")
t = p.read_text(encoding="utf-8")
note = "\n## 2026-11-05 Round 6（AI 对话）\n已完成：Roadmap 2.1 审计 UI 切片（来源筛选、标签#、策略列、允/拦/消中文；数据/导出此前已有）；WindowControls Electron 守卫；`docs/screenshots/r6/` 矩阵。\n下一轮建议：2.3 对话内跳转审计 / 真机 Tauri 置前脚本修好后补拍 HEAD debug；或 H04 流式停止真态（非 DOM 注入）。\n"
if "Round 6（AI 对话）" not in t:
    p.write_text(t.rstrip() + "\n" + note, encoding="utf-8", newline="\n")
    print("backlog updated")
else:
    print("backlog already")
