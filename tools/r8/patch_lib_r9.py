from pathlib import Path
lib = Path("src-tauri/src/lib.rs")
text = lib.read_text(encoding="utf-8")

if "mod session_import;" not in text:
    text = text.replace("mod sessions_io;\n", "mod sessions_io;\nmod session_import;\n", 1)

# Replace sessions_import_pick body
import re
pat = r"#\[tauri::command\]\nfn sessions_import_pick\(app: tauri::AppHandle\) -> Result<Option<Value>, String> \{.*?\n\}"
new_pick = '''#[tauri::command]
fn sessions_import_pick(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().blocking_pick_files();
    let Some(list) = picked else {
        return Ok(None);
    };
    let paths: Vec<std::path::PathBuf> = list.into_iter().filter_map(|fp| fp.into_path().ok()).collect();
    if paths.is_empty() {
        return Ok(None);
    }
    let result = session_import::import_session_files(&paths);
    let empty_items = result
        .get("items")
        .and_then(|x| x.as_array())
        .map(|a| a.is_empty())
        .unwrap_or(true);
    let empty_notes = result
        .get("notes")
        .and_then(|x| x.as_array())
        .map(|a| a.is_empty())
        .unwrap_or(true);
    if empty_items and empty_notes:
        pass
    Ok(Some(result))
}'''
# fix python mistake in new_pick
new_pick = '''#[tauri::command]
fn sessions_import_pick(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().blocking_pick_files();
    let Some(list) = picked else {
        return Ok(None);
    };
    let paths: Vec<std::path::PathBuf> = list.into_iter().filter_map(|fp| fp.into_path().ok()).collect();
    if paths.is_empty() {
        return Ok(None);
    }
    let result = session_import::import_session_files(&paths);
    let empty_items = result
        .get("items")
        .and_then(|x| x.as_array())
        .map(|a| a.is_empty())
        .unwrap_or(true);
    let empty_notes = result
        .get("notes")
        .and_then(|x| x.as_array())
        .map(|a| a.is_empty())
        .unwrap_or(true);
    if empty_items && empty_notes {
        return Ok(None);
    }
    Ok(Some(result))
}'''
m = re.search(pat, text, flags=re.S)
if not m:
    raise SystemExit("sessions_import_pick not found")
text = text[:m.start()] + new_pick + text[m.end():]

# Replace health probe commands
pat_hp = r"#\[tauri::command\]\nasync fn workspace_health_probe\(state: State<'_, AppState>, payload: Value\) -> Result<Value, String> \{.*?\nfn workspace_health_probe_release\(\) -> Value \{\n    json!\(\{ \"ok\": true \}\)\n\}"
# do stepwise replacements instead
old_sweep = '''#[tauri::command]
fn workspace_health_probe_sweep() -> Value {
    json!({ "ok": true })
}

#[tauri::command]
fn workspace_health_probe_release() -> Value {
    json!({ "ok": true })
}'''
new_sweep = '''#[tauri::command]
async fn workspace_health_probe_sweep(state: State<'_, AppState>, idle_ms: Option<u64>) -> Value {
    state.ssh.probe_sweep(idle_ms.unwrap_or(30_000)).await
}

#[tauri::command]
async fn workspace_health_probe_release(state: State<'_, AppState>, profile_id: Option<String>) -> Value {
    state.ssh.probe_release(profile_id).await
}'''
if old_sweep not in text:
    raise SystemExit("sweep/release stubs missing")
text = text.replace(old_sweep, new_sweep, 1)

# Replace workspace_health_probe function body - find and replace whole function until next #[tauri::command] after it that is sweep - already replaced sweep. Find health_probe function.
pat2 = r"#\[tauri::command\]\nasync fn workspace_health_probe\(state: State<'_, AppState>, payload: Value\) -> Result<Value, String> \{.*?\n\}"
new_hp = r'''#[tauri::command]
async fn workspace_health_probe(app: tauri::AppHandle, state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let profile_id = payload
        .get("profileId")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let at = chrono::Utc::now().timestamp_millis();
    if profile_id.is_empty() {
        return Ok(json!({
            "profileId": "",
            "ok": false,
            "cpu": null, "mem": null, "disk": null, "latencyMs": null,
            "at": at, "via": "none", "kind": "health-probe",
            "error": "bad request", "code": "other",
        }));
    }
    let host = payload.get("host").and_then(|x| x.as_str()).unwrap_or("");
    let demo = payload.get("demo").and_then(|x| x.as_bool()).unwrap_or(false) || host == "demo.local";
    if demo {
        let n = profile_id.bytes().fold(0u32, |a, b| a.wrapping_add(b as u32));
        return Ok(json!({
            "profileId": profile_id,
            "ok": true,
            "cpu": 20 + (n % 55),
            "mem": 25 + ((n >> 8) % 50),
            "disk": 10 + ((n >> 16) % 70),
            "latencyMs": 9,
            "at": at,
            "via": "demo",
            "kind": "health-probe",
            "load": [0.2, 0.3, 0.4],
        }));
    }
    let reuse = payload
        .get("reuseSessionId")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let exec_id = if !reuse.is_empty() {
        reuse
    } else {
        // Independent short connection pool
        let username = payload
            .get("username")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if host.is_empty() || username.is_empty() {
            return Ok(json!({
                "profileId": profile_id,
                "ok": false,
                "cpu": null, "mem": null, "disk": null, "latencyMs": null,
                "at": at, "via": "none", "kind": "health-probe",
                "error": "no-session", "code": "no-session",
            }));
        }
        let opts = ssh::SshConnectOptions {
            host: host.to_string(),
            port: payload.get("port").and_then(|x| x.as_u64()).map(|n| n as u16),
            username,
            password: payload.get("password").and_then(|x| x.as_str()).map(|s| s.to_string()),
            private_key_path: payload
                .get("privateKeyPath")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            passphrase: payload.get("passphrase").and_then(|x| x.as_str()).map(|s| s.to_string()),
            label: Some(format!("probe:{profile_id}")),
            term_cols: Some(80),
            term_rows: Some(24),
            auth_mode: payload.get("authMode").and_then(|x| x.as_str()).map(|s| s.to_string()),
            demo: None,
            forwards: None,
            jump_host: None,
            jump_chain: payload.get("jumpChain").cloned().and_then(|v| serde_json::from_value(v).ok()),
            agent_forward: None,
            agent_socket: payload.get("agentSocket").and_then(|x| x.as_str()).map(|s| s.to_string()),
            timeout_ms: Some(12_000),
            resume_from_hop: None,
            jump_retry_from_failed_hop: Some(false),
            probe_only: Some(true),
            probe_profile_id: Some(profile_id.clone()),
        };
        match state.ssh.probe_open(app, profile_id.clone(), opts).await {
            Ok(r) => r.session_id,
            Err(e) => {
                return Ok(json!({
                    "profileId": profile_id,
                    "ok": false,
                    "cpu": null, "mem": null, "disk": null, "latencyMs": null,
                    "at": chrono::Utc::now().timestamp_millis(),
                    "via": "none",
                    "kind": "health-probe",
                    "error": format!("{e:#}"),
                    "code": "exec-failed",
                }));
            }
        }
    };
    let via = if payload.get("reuseSessionId").and_then(|x| x.as_str()).unwrap_or("").is_empty() {
        "probe"
    } else {
        "session"
    };
    let started = std::time::Instant::now();
    match state
        .ssh
        .exec(&exec_id, server_tools::RESOURCE_PROBE_CMD.into(), Some(15_000))
        .await
    {
        Ok(raw) => {
            let metrics = server_tools::parse_health_metrics(&exec_output(&raw));
            Ok(json!({
                "profileId": profile_id,
                "ok": true,
                "cpu": metrics.get("cpu"),
                "mem": metrics.get("mem"),
                "disk": metrics.get("disk"),
                "load": metrics.get("load"),
                "latencyMs": started.elapsed().as_millis() as u64,
                "at": chrono::Utc::now().timestamp_millis(),
                "via": via,
                "kind": "health-probe",
            }))
        }
        Err(e) => {
            let _ = state.ssh.probe_release(Some(profile_id.clone())).await;
            Ok(json!({
                "profileId": profile_id,
                "ok": false,
                "cpu": null, "mem": null, "disk": null, "latencyMs": null,
                "at": chrono::Utc::now().timestamp_millis(),
                "via": "none",
                "kind": "health-probe",
                "error": format!("{e:#}"),
                "code": "exec-failed",
            }))
        }
    }
}'''
m2 = re.search(pat2, text, flags=re.S)
if not m2:
    raise SystemExit("workspace_health_probe fn not found")
text = text[:m2.start()] + new_hp + text[m2.end():]

# Insert additional commands before stub_not_implemented
extra = r'''
#[tauri::command]
async fn workspace_resources(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let raw = state
        .ssh
        .exec(&session_id, server_tools::RESOURCE_PROBE_CMD.into(), Some(20_000))
        .await
        .map_err(|e| format!("{e:#}"))?;
    Ok(server_tools::parse_resource_snapshot(&exec_output(&raw)))
}

#[tauri::command]
async fn forwards_restore(
    state: State<'_, AppState>,
    payload: Value,
) -> Result<Value, String> {
    let from = payload
        .get("fromSessionId")
        .or_else(|| payload.get("from"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let to = payload
        .get("toSessionId")
        .or_else(|| payload.get("to"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if from.is_empty() || to.is_empty() {
        return Ok(json!({ "ok": false, "restored": [], "skipped": [], "error": "bad-request" }));
    }
    let allow_remote = payload
        .get("allowRemote")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    let specs = state.forwards.take_carry(&from);
    let mut restored = Vec::new();
    let mut skipped = Vec::new();
    for spec in specs {
        if spec.direction.eq_ignore_ascii_case("R") && !allow_remote {
            skipped.push(json!({
                "spec": {
                    "direction": spec.direction,
                    "localHost": spec.local_host,
                    "localPort": spec.local_port,
                    "remoteHost": spec.remote_host,
                    "remotePort": spec.remote_port,
                },
                "reason": "readonly",
            }));
            continue;
        }
        let fs = ForwardSpec {
            direction: Some(spec.direction.clone()),
            local_host: spec.local_host.clone(),
            local_port: spec.local_port,
            remote_host: spec.remote_host.clone(),
            remote_port: spec.remote_port,
        };
        match state.ssh.add_forward(to.clone(), fs).await {
            Ok(active) => restored.push(json!(active)),
            Err(e) => skipped.push(json!({
                "spec": {
                    "direction": spec.direction,
                    "localHost": spec.local_host,
                    "localPort": spec.local_port,
                    "remoteHost": spec.remote_host,
                    "remotePort": spec.remote_port,
                },
                "reason": "error",
                "message": format!("{e:#}"),
            })),
        }
    }
    Ok(json!({ "ok": true, "restored": restored, "skipped": skipped }))
}

#[tauri::command]
fn local_fs_hash(target: String, max_bytes: Option<u64>) -> Result<String, String> {
    local_fs::hash(target, max_bytes)
}

#[tauri::command]
fn local_fs_detect_key_kind(target: String) -> String {
    local_fs::detect_key_kind(target)
}

#[tauri::command]
async fn sftp_hash(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    max_bytes: Option<u64>,
) -> Result<String, String> {
    state
        .ssh
        .sftp_hash(&session_id, remote_path, max_bytes)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn core_memory_compact_turns(
    session_key: String,
    turns: Vec<Value>,
    max_turns: Option<usize>,
) -> Value {
    core_memory::compact_turns(&session_key, turns, max_turns)
}

#[tauri::command]
fn core_memory_recall(session_key: String, query: String, top_k: Option<usize>) -> Value {
    core_memory::recall_episodes(&session_key, &query, top_k)
}

'''
marker = "#[tauri::command]\nfn stub_not_implemented"
if "fn workspace_resources" not in text:
    if marker not in text:
        raise SystemExit("stub marker missing")
    text = text.replace(marker, extra + "\n" + marker, 1)

# handler registrations
adds = """            workspace_resources,
            forwards_restore,
            local_fs_hash,
            local_fs_detect_key_kind,
            sftp_hash,
            core_memory_compact_turns,
            core_memory_recall,
            stub_ok,"""
if "workspace_resources," not in text:
    text = text.replace("            stub_ok,", adds, 1)

# ensure ForwardSpec imported - already used via crate::forward
lib.write_text(text, encoding="utf-8")
print("lib.rs Round-9 patched")
