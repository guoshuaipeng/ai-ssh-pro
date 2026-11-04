from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
# Update implemented section bullets
old_gap = """## 尚未移植（缺口）

- SSH agent forward；jump 失败续跳 / probeJump 完整 UX
- SFTP：断点续传（队列持久化已有；真正 resume 后置）
- Docker：Swarm 详情/日志/动作、事件 watch、openShell
"""
# Read rest of gaps
idx = t.find("## 尚未移植")
print("gap section starts", idx)
print(t[idx:idx+1200])
