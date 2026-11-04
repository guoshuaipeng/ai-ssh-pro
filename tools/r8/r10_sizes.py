from pathlib import Path
exe = Path("src-tauri/target/release/ai-ssh-pro.exe").stat().st_size
nsis = Path("src-tauri/target/release/bundle/nsis/AI-SSH-Pro_0.7.0_x64-setup.exe").stat().st_size
msi = Path("src-tauri/target/release/bundle/msi/AI-SSH-Pro_0.7.0_x64_en-US.msi").stat().st_size
p = Path("MIGRATION-TAURI.md")
lines = p.read_text(encoding="utf-8").splitlines(True)
for i, line in enumerate(lines):
    if "`ai-ssh-pro.exe`（release）" in line and "MB" in line:
        lines[i] = f"| `ai-ssh-pro.exe`（release） | **{exe/1024/1024:.2f} MB** ({exe}) | Round-10 |\n"
    if "NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe`" in line and "MB" in line:
        lines[i] = f"| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **{nsis/1024/1024:.2f} MB** ({nsis}) | |\n"
    if "MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi`" in line and "MB" in line:
        lines[i] = f"| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **{msi/1024/1024:.2f} MB** ({msi}) | |\n"
p.write_text("".join(lines), encoding="utf-8")
print(exe, nsis, msi)
