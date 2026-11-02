from pathlib import Path
# quick warning fixes
ssh = Path("src-tauri/src/ssh.rs").read_text(encoding="utf-8")
ssh = ssh.replace("        let mut channel = handle\n            .lock()\n            .await\n            .channel_open_session()\n            .await\n            .context(\"open docker exec session\")?;",
                  "        let channel = handle\n            .lock()\n            .await\n            .channel_open_session()\n            .await\n            .context(\"open docker exec session\")?;", 1)
# channel needs mut for request_pty and exec - actually in russh Channel methods take &self or &mut self?
# If request_pty needs &mut self, keep mut. Warning said mut not needed - so methods take &self. OK.
Path("src-tauri/src/ssh.rs").write_text(ssh, encoding="utf-8")

kh = Path("src-tauri/src/known_hosts_lookup.rs").read_text(encoding="utf-8")
kh = kh.replace("let L = lines[j].trim();", "let line_body = lines[j].trim();")
kh = kh.replace("if line_body.is_empty()", "if line_body.is_empty()")  # noop ensure
# also replace uses of L after rename
kh = kh.replace("""                let line_body = lines[j].trim();
                if L.is_empty() {
                    continue;
                }
                if L.starts_with('#') {
                    break;
                }
                body = L.to_string();""",
"""                let line_body = lines[j].trim();
                if line_body.is_empty() {
                    continue;
                }
                if line_body.starts_with('#') {
                    break;
                }
                body = line_body.to_string();""")
Path("src-tauri/src/known_hosts_lookup.rs").write_text(kh, encoding="utf-8")

# allow dead list_swarm_minimal by prefixing allow or delete - delete body call only keep with allow
docker = Path("src-tauri/src/docker.rs").read_text(encoding="utf-8")
if "#[allow(dead_code)]\nasync fn list_swarm_minimal" not in docker:
    docker = docker.replace("async fn list_swarm_minimal", "#[allow(dead_code)]\nasync fn list_swarm_minimal", 1)
Path("src-tauri/src/docker.rs").write_text(docker, encoding="utf-8")
print("warnings cleaned")
