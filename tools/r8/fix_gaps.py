from pathlib import Path
p = Path("MIGRATION-TAURI.md")
text = p.read_text(encoding="utf-8")
old = """## 尚未移植（缺口）

- OpenClaw 全量：episodes / citeHold / 运行摘要压缩与 Electron 观测管线完整对等；远程 tools（processes/services/ports/df/logs）与 workspace.batchExec/healthProbe
- 本地回收站 trash/restore、SFTP hash、snapshots 库、sessions.export / importSshConfig 完整解析
- 云同步：OAuth 浏览器登录、真正到点自动 push/pull（骨架只发 tick；**实网仍卡用户 token/口令**）
- **真实自动安装更新**（**卡在用户代码签名证书** + `tauri-plugin-updater` 发布端点；当前仅 check，`installDeferred: true`）
- known_hosts：**无法**对 `|1|…` 哈希行做反向解哈希整文件导入（只能主机名列表 + `ssh-keygen -F` 批量解析后导入）
- SSH agent forward / jump 续跳 **实机验证**依赖本机 Agent、跳板可达性与用户密钥
"""
new = """## 尚未移植（缺口）（Tauri-only 产品）

- sessions **完整**第三方导入：Xshell / PuTTY / MobaXterm / SecureCRT / FinalShell（importPick 已支持 OpenSSH config + JSON profiles）
- healthProbe **独立**短连 probe 池（现仅 `reuseSessionId` / demo；无 held probe client）
- workspace.resources 完整面板、forwards.restore 批量恢复；SFTP `hash` / `detectKeyKind` 等边角
- OpenClaw：embedding 召回、与 Electron 同构的完整 transcript compact / cite scrub 测试覆盖
- 云同步：OAuth 浏览器登录、真正到点自动 push/pull（骨架只发 tick；**实网仍卡用户 token/口令**）
- **真实自动安装更新**（**卡在用户代码签名证书** + `tauri-plugin-updater` 发布端点；当前仅 check，`installDeferred: true`）
- known_hosts：**无法**对 `|1|…` 哈希行做反向解哈希整文件导入（只能主机名列表 + `ssh-keygen -F` 批量解析后导入）
- SSH agent forward / jump 续跳 **实机验证**依赖本机 Agent、跳板可达性与用户密钥
- Electron 打包：**不再作为产品主路径**（`dev:electron` / `dist:electron` 仅对照）
"""
if old not in text:
    raise SystemExit("gap section not found exact")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
print("gaps updated")
