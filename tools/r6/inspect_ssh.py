from pathlib import Path
import re
p = Path("src-tauri/src/ssh.rs")
t = p.read_text(encoding="utf-8")

# Fix windows pipe path - should be r"\\.\pipe\openssh-ssh-agent"
t = t.replace(
    r'return Some(r"\\\\.\\pipe\\openssh-ssh-agent".into());',
    'return Some(r"\\\\.\\pipe\\openssh-ssh-agent".into());',
)
# In the file after write, count backslashes
# Desired Rust source: r"\\.\pipe\openssh-ssh-agent"
# In Python string that's: r"\\.\pipe\openssh-ssh-agent" written as 'r"\\\\.\\pipe\\openssh-ssh-agent"'
# Check current:
idx = t.find("openssh-ssh-agent")
print("pipe snippet:", repr(t[idx-30:idx+40]))

# Fix make_handler calls - need context-aware
# Direct connect (no hops): enable agent socket if agent_forward
# Replace the empty-hops block more carefully

# Generic: make_handler(&app, X, Y) -> need 4th arg
# Count occurrences
print("make_handler calls", t.count("self.make_handler("))

# authenticate_handle calls need agent_socket too
print("auth calls", len(re.findall(r"Self::authenticate_handle\(", t)))

# Show first auth call
m = re.search(r"Self::authenticate_handle\(\s*&mut handle,\s*&opts\.username,.*?\.await\?;", t, re.S)
if m:
    print("AUTH1:\n", m.group(0)[:400])
