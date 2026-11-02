from pathlib import Path
p = Path("MIGRATION-TAURI.md")
lines = p.read_text(encoding="utf-8").splitlines(True)
for i, line in enumerate(lines):
    if "`ai-ssh-pro.exe`（release）" in line and "7.95" in line:
        lines[i] = "| `ai-ssh-pro.exe`（release） | **8.08 MB** (8474112) | Round-9 + 无边框窗控 |\n"
    if "NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe`" in line and "3.29" in line:
        lines[i] = "| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.33 MB** (3494783) | |\n"
    if "MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi`" in line and "4.27" in line:
        lines[i] = "| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.33 MB** (4538368) | |\n"
p.write_text("".join(lines), encoding="utf-8")
print("sizes updated")
for i,l in enumerate(lines[115:122], start=116):
    print(i, l.rstrip())
