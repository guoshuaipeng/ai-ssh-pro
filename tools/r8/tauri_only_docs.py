from pathlib import Path
import json

# --- package.json: Tauri as default entry ---
pj = Path("package.json")
data = json.loads(pj.read_text(encoding="utf-8"))
scripts = data.setdefault("scripts", {})
# Preserve electron under explicit names if not already
if "dev:electron" not in scripts and scripts.get("dev", "").startswith("electron"):
    scripts["dev:electron"] = scripts["dev"]
if "build:electron" not in scripts and scripts.get("build", "") == "electron-vite build":
    scripts["build:electron"] = "electron-vite build"
if "preview:electron" not in scripts and "preview" in scripts:
    scripts["preview:electron"] = scripts["preview"]
scripts["dev"] = "tauri dev"
scripts["build"] = "npm run build:tauri"
scripts["preview"] = "npm run build:web && tauri preview"
# Keep electron dist behind explicit name
if "dist" in scripts and "dist:electron" not in scripts:
    scripts["dist:electron"] = scripts.pop("dist")
elif "dist" in scripts:
    # rename main dist away from default if it is electron-builder
    if "electron" in scripts["dist"] or "electron-builder" in scripts["dist"]:
        scripts["dist:electron"] = scripts.pop("dist")
pj.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("package.json updated; scripts.dev=", scripts["dev"], "build=", scripts["build"])

# --- MIGRATION-TAURI.md ---
md = Path("MIGRATION-TAURI.md")
text = md.read_text(encoding="utf-8")
old_goal = """当前仓库为 **双轨**：Electron（`npm run dev` / `npm run dist`）仍可用；Tauri 为新主路径（`npm run dev:tauri` / `npm run build:tauri`）。"""
new_goal = """**产品路径：仅 Tauri**（小体积 WebView2）。默认脚本 `npm run dev` / `npm run build` 走 Tauri；桌面快捷方式 `AI-SSH-Pro (Tauri latest).lnk` 始终指向最新 `src-tauri/target/release/ai-ssh-pro.exe`。仓库内 Electron 源码可暂留作对照，但 **不再维护 Electron 打包/宣传**（如需：`npm run dev:electron` / `npm run build:electron` / `npm run dist:electron`）。"""
if old_goal in text:
    text = text.replace(old_goal, new_goal, 1)
else:
    text = text.replace(
        "当前仓库为 **双轨**",
        "**产品路径：仅 Tauri**。原双轨说明作废；Electron",
        1,
    )

# Update 仍缺 section if present
still = """## 仍缺 / 已知缺口（相对 Electron）"""
round8 = """
### Round-8 变更摘要

- **远程 tools**：`processes` / `kill` / `services` / `service` / `ports` / `df` / `logs`（`server_tools.rs` + `ssh.exec` 解析，对齐 shared/server-tools）
- **workspace**：`batchExec`（多会话并行 exec）、`healthProbe`（复用会话采样 / demo；无独立 probe 连接池）、sweep/release 空实现占位
- **snapshots**：加密远端文本快照（本地 `snapshot.key` + AES-GCM；list/stats/put/prefs/read/pin/delete/clear/openDir）
- **localFs.trash / restore**：本地暂存书 + token 撤销
- **sessions.export**（json / openssh）+ **importSshConfig**（Include 展开 + Host 解析）+ **importPick**（ssh-config / JSON profiles；Xshell/PuTTY/Moba 等仍缺口）
- **OpenClaw**：`episodes` / `citeHold` / `runningSummary` + `compress` / `appendEpisode` / `setCiteHold`（extractive 压缩管线；无 embedding）
- 桥：`tauri-bridge.ts` 上述 API 全部接真命令
- **产品策略**：默认入口改为 Tauri-only；Electron 降为可选对照脚本

"""
if "### Round-8 变更摘要" not in text:
    # insert before Round-3 or after volume table
    anchor = "### Round-3 变更摘要"
    if anchor in text:
        text = text.replace(anchor, round8 + anchor, 1)
    else:
        text += "\n" + round8

# Refresh 仍缺 list
old_gap = None
# find section starting with ## 仍缺
idx = text.find("## 仍缺")
if idx >= 0:
    end = text.find("\n## ", idx + 3)
    if end < 0:
        end = text.find("\n##实测", idx)
    # replace whole section content until next ##
    next_h = text.find("\n## ", idx + 1)
    if next_h > idx:
        new_gap = """## 仍缺 / 已知缺口（相对 Electron，Tauri-only 产品）

- sessions **完整**第三方导入：Xshell / PuTTY / MobaXterm / SecureCRT / FinalShell（当前 importPick 仅 OpenSSH config + JSON profiles）
- healthProbe **独立**短连 probe 池（现仅 reuseSessionId / demo；无 held probe client）
- workspace.resources 完整 RESOURCE 面板、forwards.restore 批量恢复
- OpenClaw：embedding 召回、完整 transcript compact 与 Electron 同构的 cite scrub 全量测试
- 云同步：OAuth 浏览器登录、真正到点自动 push/pull（骨架只发 tick；**实网仍卡用户 token/口令**）
- **真实自动安装更新**（**卡在用户代码签名证书** + `tauri-plugin-updater` 发布端点；当前仅 check，`installDeferred: true`）
- known_hosts：**无法**对 `|1|…` 哈希行做反向解哈希整文件导入（只能主机名列表 + `ssh-keygen -F` 批量解析后导入）
- SSH agent forward / jump 续跳 **实机验证**依赖本机 Agent、跳板可达性与用户密钥
- Electron 打包路径：**不再作为产品主路径**（源码对照保留）

"""
        text = text[:idx] + new_gap + text[next_h+1:]

# bump volume note placeholder for Round-8 — will fill after build
text = text.replace(
    "| `ai-ssh-pro.exe`（release） | **7.71 MB** (8089088) | Round-7 |",
    "| `ai-ssh-pro.exe`（release） | **(pending Round-8 build)** | Round-8 |",
)

md.write_text(text, encoding="utf-8")
print("MIGRATION updated")

# README light touch
readme = Path("README.md")
r = readme.read_text(encoding="utf-8")
old = "类 Xshell 的多会话 SSH 客户端，集成 AI 对话（Electron + TypeScript + React）。"
new = "类 Xshell 的多会话 SSH 客户端，集成 AI 对话。**产品路径：Tauri v2（WebView2，小体积）**；技术栈 TypeScript + React + Rust。Electron 源码仅作仓库对照，不再作为默认打包路径。"
if old in r:
    r = r.replace(old, new, 1)
    readme.write_text(r, encoding="utf-8")
    print("README updated")
else:
    print("README lead already changed or not found")
