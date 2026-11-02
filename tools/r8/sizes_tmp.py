from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
import re
t = re.sub(
    r"\| `ai-ssh-pro\.exe`（release） \| \*\*.*?\*\* \| Round-8 \|",
    f"| `ai-ssh-pro.exe`（release） | **EXE_MB MB** (EXE_BYTES) | Round-8 |",
    t,
    count=1,
)
t = re.sub(
    r"\| NSIS `AI-SSH-Pro_0\.7\.0_x64-setup\.exe` \| \*\*.*?\*\* \|",
    f"| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **NSIS_MB MB** (NSIS_BYTES) |",
    t,
    count=1,
)
t = re.sub(
    r"\| MSI `AI-SSH-Pro_0\.7\.0_x64_en-US\.msi` \| \*\*.*?\*\* \|",
    f"| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **MSI_MB MB** (MSI_BYTES) |",
    t,
    count=1,
)
t = t.replace("EXE_MB", "PLACE_EXE").replace("EXE_BYTES", "PLACE_EXE_B")
p.write_text(t, encoding="utf-8")
print("placeholder written")
