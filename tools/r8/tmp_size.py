from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
import re
# update size table Round-8 row / add Round-9
old = """| `ai-ssh-pro.exe`（release） | **7.95 MB** (8334336) | Round-8 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.29 MB** (3449270) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.27 MB** (4476928) | |"""
new = """| `ai-ssh-pro.exe`（release） | **8.08 MB** (8473088) | Round-9 + 无边框窗控 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.33 MB** (3491326) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.33 MB** (4538368) | |"""
# use actual sizes from shell - rewrite with placeholders then fix
exe_b = 8473088  # will patch below from env file
