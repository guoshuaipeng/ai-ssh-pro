from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\src-tauri\src\lib.rs")
t = p.read_text(encoding="utf-8")
old = """#[tauri::command]

#[tauri::command]
async fn docker_list_tree"""
new = """#[tauri::command]
async fn docker_list_tree"""
if old not in t:
    raise SystemExit("double attr not found")
t = t.replace(old, new, 1)
old2 = """

fn stub_ok() -> bool {
    true
}"""
new2 = """

#[tauri::command]
fn stub_ok() -> bool {
    true
}"""
if old2 not in t:
    raise SystemExit("stub_ok block not found")
t = t.replace(old2, new2, 1)
# also fix docker unused stderr
p.write_text(t, encoding="utf-8")
print("lib.rs attr fixed")
docker = Path(r"E:\pythonProjects\ai-ssh-pro\src-tauri\src\docker.rs")
d = docker.read_text(encoding="utf-8")
d = d.replace("Ok((code, stdout, stderr)) if code.unwrap_or(1) == 0 => {", "Ok((code, stdout, _stderr)) if code.unwrap_or(1) == 0 => {", 1)
docker.write_text(d, encoding="utf-8")
print("docker warning fixed")