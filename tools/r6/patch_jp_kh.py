from pathlib import Path

# --- jump_probe: fix auth call + add hop emit ---
jp = Path("src-tauri/src/jump_probe.rs")
t = jp.read_text(encoding="utf-8")
t = t.replace(
    'crate::ssh::authenticate_with_agent(handle, username, agent_socket).await?,',
    'crate::ssh::SshManager::authenticate_with_agent(handle, username, agent_socket).await?,',
)
# Add tauri emit support
if "AppHandle" not in t:
    t = t.replace(
        "use crate::ssh::{JumpHop, SshConnectOptions};",
        "use tauri::{AppHandle, Emitter};\nuse crate::ssh::{JumpHop, SshConnectOptions};",
    )
    t = t.replace(
        "pub async fn probe_jump_chain(\n    known: Arc<KnownHostsStore>,\n    opts: SshConnectOptions,\n) -> Result<Vec<HopProbeRow>> {",
        "pub async fn probe_jump_chain(\n    app: Option<AppHandle>,\n    known: Arc<KnownHostsStore>,\n    opts: SshConnectOptions,\n) -> Result<Vec<HopProbeRow>> {",
    )
    # emit before each hop attempt
    needle = "    for (i, step) in steps.iter().enumerate() {\n        let started = Instant::now();"
    emit = """    for (i, step) in steps.iter().enumerate() {
        if let Some(app) = &app {
            let _ = app.emit(
                "ssh:hop",
                json!({
                    "hop": (i + 1) as u32,
                    "total": total,
                    "name": step.name,
                    "addr": format!("{}:{}", step.host, step.port),
                    "phase": "probing",
                }),
            );
            let _ = app.emit(
                "ssh:stage",
                json!({
                    "stage": "probe",
                    "hop": (i + 1) as u32,
                    "total": total,
                    "name": step.name,
                    "message": format!("probing {}:{}", step.host, step.port),
                }),
            );
        }
        let started = Instant::now();"""
    if needle not in t:
        raise SystemExit("probe loop not found")
    t = t.replace(needle, emit)
jp.write_text(t, encoding="utf-8")
print("jump_probe ok")

# --- known_hosts_lookup bulk ---
kh = Path("src-tauri/src/known_hosts_lookup.rs")
k = kh.read_text(encoding="utf-8")
if "lookup_hosts_bulk" not in k:
    k += """

/// Bulk hashed-line resolve: run `ssh-keygen -F` for each named host (no reverse-hash of `|1|…`).
/// Returns aggregated matches suitable for import preview / apply.
pub fn lookup_hosts_bulk(hosts: Vec<Value>, file_path: Option<String>) -> Value {
    let mut all_matches: Vec<Value> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();
    let mut queried = 0u32;
    for item in hosts {
        let host = item
            .get("host")
            .or_else(|| item.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let Some(host) = host else { continue };
        let port = item
            .get("port")
            .and_then(|v| v.as_u64())
            .map(|p| p as u16);
        queried += 1;
        let one = lookup_host(host.clone(), port, file_path.clone());
        if let Some(arr) = one.get("matches").and_then(|m| m.as_array()) {
            for m in arr {
                all_matches.push(m.clone());
            }
        }
        if let Some(err) = one.get("error").filter(|e| !e.is_null()) {
            if one.get("matches").and_then(|m| m.as_array()).map(|a| a.is_empty()).unwrap_or(true) {
                errors.push(json!({
                    "host": host,
                    "port": port.unwrap_or(22),
                    "error": err.clone(),
                    "missingTool": one.get("missingTool").cloned().unwrap_or(Value::Bool(false)),
                }));
            }
        }
    }
    // Dedup by host+port+hostKeyBase64
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::new();
    for m in all_matches {
        let key = format!(
            "{}|{}|{}",
            m.get("host").and_then(|v| v.as_str()).unwrap_or(""),
            m.get("port").and_then(|v| v.as_u64()).unwrap_or(22),
            m.get("hostKeyBase64").and_then(|v| v.as_str()).unwrap_or(""),
        );
        if seen.insert(key) {
            deduped.push(m);
        }
    }
    json!({
        "ok": true,
        "queried": queried,
        "matches": deduped,
        "errors": errors,
        "note": "Hashed known_hosts lines cannot be reverse-hashed; provide hostnames to resolve via ssh-keygen -F.",
    })
}
"""
    kh.write_text(k, encoding="utf-8")
    print("bulk lookup added")
else:
    print("bulk already")
