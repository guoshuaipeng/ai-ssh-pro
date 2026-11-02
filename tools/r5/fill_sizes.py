from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
exe = Path("src-tauri/target/release/ai-ssh-pro.exe").stat().st_size
nsis = Path("src-tauri/target/release/bundle/nsis/AI-SSH-Pro_0.7.0_x64-setup.exe").stat().st_size
msi = Path("src-tauri/target/release/bundle/msi/AI-SSH-Pro_0.7.0_x64_en-US.msi").stat().st_size
def mb(n):
    return f"**{n/1024/1024:.2f} MB** ({n})"
old = """## 实测体积（本机 Windows x64，待 Round-5 构建回填）

| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | _(build)_ | Round-5 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | _(build)_ | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | _(build)_ | |

对比：Electron ~169 MB / slim ~82 MB。目标仍 **≤20 MB**。
"""
new = f"""## 实测体积（本机 Windows x64，2026-11-02 Asia/Shanghai）

| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | {mb(exe)} | Round-5 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | {mb(nsis)} | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | {mb(msi)} | |

对比：Electron ~169 MB / slim ~82 MB。**仍远低于 20 MB**。
"""
assert old in t
p.write_text(t.replace(old, new), encoding="utf-8")
print("sizes written", mb(exe), mb(nsis), mb(msi))
