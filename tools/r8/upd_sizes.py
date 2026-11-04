from pathlib import Path
import re
p = Path('MIGRATION-TAURI.md')
t = p.read_text(encoding='utf-8')
t = re.sub(r'\| i-ssh-pro\.exe（release） \| \*\*.*?\*\* \| Round-8 \|',
           '| i-ssh-pro.exe（release） | **7.95 MB** (8334336) | Round-8 |', t, count=1)
t = re.sub(r'\| NSIS AI-SSH-Pro_0\.7\.0_x64-setup\.exe \| \*\*.*?\*\* \|',
           '| NSIS AI-SSH-Pro_0.7.0_x64-setup.exe | **3.29 MB** (3449270) |', t, count=1)
t = re.sub(r'\| MSI AI-SSH-Pro_0\.7\.0_x64_en-US\.msi \| \*\*.*?\*\* \|',
           '| MSI AI-SSH-Pro_0.7.0_x64_en-US.msi | **4.27 MB** (4476928) |', t, count=1)
p.write_text(t, encoding='utf-8')
print('sizes updated')
