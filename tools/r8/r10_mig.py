from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
# Update gaps for OpenClaw
old = """- OpenClaw：**向量 embedding 召回**仍缺（Round-9 已上 extractive `compactTurns` + keyword `recall`；无 embedding 模型）
- OpenClaw：与 Electron 同构的 cite scrub / compact **测试覆盖**仍缺
- 第三方导入：部分私有加密格式 / 未导出会话仍可能解析不到（Xshell `.xsh` / PuTTY `.reg` / Moba / SecureCRT / FinalShell 主路径已接）"""
new = """- OpenClaw：**远程向量 embedding 服务**仍不接（Round-10 用本地 char-trigram + RRF 作 embedding 槽位；可换真 embedding ranks 而不改 prompt）
- 第三方导入：厂商**专有加密库**仍不解密（已给清晰 notes；请导出明文 / OpenSSH config）"""
if old in t:
    t = t.replace(old, new, 1)
    print("gaps updated")
else:
    print("gap block not found")
    # show current gaps section
    i = t.find("尚未移植")
    print(t[i:i+600])

r10 = """### Round-10 变更摘要

- **OpenClaw cite scrub / compact**：`CiteWindow` 对齐 outsideHeadTail + droppedFiller；compact 时 scrub fillers；`applyCiteScrub` 命令
- **召回增强**：keyword + Jaccard overlap + **本地 char-trigram** ranks，RRF 融合（无远程 embedding）
- **单测**：`core_memory::tests` 5 项（scrub / rare markers / recall topK·相关性 / compact scrub）
- **会话导入边角**：加密/受保护 Xshell·Moba·FinalShell·SecureCRT·PuTTY 口令字段 → 明确中文 notes，不假装解密
- **桥安全**：`installTauriBridge` 末尾兜底 `getWorkingMemory` / `confirmStep` / `parseSshForm` / `setSessionProtection`，防再黑屏
- **云同步 / 签名 updater**：仍仅文档；不假装已实网 OAuth 或自动安装

"""
if "### Round-10" not in t:
    t = t.replace("### Round-9 变更摘要", r10 + "### Round-9 变更摘要", 1)
    print("r10 summary added")

# clarify cloud sync / updater still deferred in 尚未移植
if "云同步：OAuth" in t and "Round-10 仍文档" not in t:
    t = t.replace(
        "云同步：OAuth 浏览器登录、真正到点自动 push/pull（骨架只发 tick；**实网仍卡用户 token/口令**）",
        "云同步：OAuth 浏览器登录、真正到点自动 push/pull（骨架只发 tick；**实网仍卡用户 token/口令**；Round-10 **只文档，不假装**）",
        1,
    )
    t = t.replace(
        "**真实自动安装更新**（**卡在用户代码签名证书** + `tauri-plugin-updater` 发布端点；当前仅 check，`installDeferred: true`）",
        "**真实自动安装更新**（**卡在用户代码签名证书** + `tauri-plugin-updater` 发布端点；当前仅 check，`installDeferred: true`；Round-10 **只文档，不假装**）",
        1,
    )
    print("sync/updater docs clarified")

p.write_text(t, encoding="utf-8")
