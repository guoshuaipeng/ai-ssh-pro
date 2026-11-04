from pathlib import Path

lib = Path(r"src-tauri/src/lib.rs")
text = lib.read_text(encoding="utf-8")

mods = """mod local_fs;
mod server_tools;
mod snapshots;
mod ssh_config;
mod sessions_io;
"""
if "mod server_tools;" not in text:
    if "mod local_fs;\n" not in text:
        raise SystemExit("mod local_fs not found")
    text = text.replace("mod local_fs;\n", mods, 1)

cmds = r'''
#[tauri::command]
fn local_fs_trash(target: String) -> Result<Value, String> {
    local_fs::trash(target)
}

#[tauri::command]
fn local_fs_restore(token: String) -> bool {
    local_fs::restore(token)
}

fn exec_output(v: &Value) -> String {
    let stdout = v.get("stdout").and_then(|x| x.as_str()).unwrap_or("");
    let stderr = v.get("stderr").and_then(|x| x.as_str()).unwrap_or("");
    if stderr.is_empty() {
        stdout.to_string()
    } else if stdout.is_empty() {
        stderr.to_string()
    } else {
        format!("{stdout}\n{stderr}")
    }
}

fn exec_code(v: &Value) -> Option<i64> {
    v.get("code").and_then(|x| x.as_i64().or_else(|| x.as_u64().map(|n| n as i64)))
}

#[tauri::command]
async fn tools_processes(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let raw = state
        .ssh
        .exec(&session_id, server_tools::PROCESS_LIST_CMD.into(), Some(20_000))
        .await
        .map_err(|e| format!("{e:#}"))?;
    let list = server_tools::parse_process_list(&exec_output(&raw));
    if list.is_empty() {
        return Err("无法读取进程列表（仅支持 Linux 主机）".into());
    }
    Ok(json!(list))
}

#[tauri::command]
async fn tools_kill(
    state: State<'_, AppState>,
    session_id: String,
    pid: u32,
    signal: Option<String>,
    sudo: Option<bool>,
) -> Result<Value, String> {
    let sig = signal.unwrap_or_else(|| "TERM".into());
    let cmd = server_tools::build_kill_command(pid, &sig, sudo.unwrap_or(false))?;
    let raw = state
        .ssh
        .exec(&session_id, cmd, Some(10_000))
        .await
        .map_err(|e| format!("{e:#}"))?;
    let out = exec_output(&raw);
    let code = exec_code(&raw).unwrap_or(-1);
    if code != 0 {
        if let Some(k) = server_tools::classify_tool_error(&out) {
            return Err(server_tools::reason_text(k));
        }
        return Err(if out.trim().is_empty() {
            "操作失败".into()
        } else {
            out
        });
    }
    Ok(json!({ "code": code, "output": out, "stdout": raw.get("stdout"), "stderr": raw.get("stderr") }))
}

#[tauri::command]
async fn tools_services(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let raw = state
        .ssh
        .exec(&session_id, server_tools::SERVICE_LIST_CMD.into(), Some(15_000))
        .await
        .map_err(|e| format!("{e:#}"))?;
    let out = exec_output(&raw);
    let list = server_tools::parse_service_list(&out);
    if list.is_empty() {
        if let Some(k) = server_tools::classify_tool_error(&out) {
            return Err(server_tools::reason_text(k));
        }
        return Err("没有读取到服务（需要 systemd）".into());
    }
    Ok(json!(list))
}

#[tauri::command]
async fn tools_service(
    state: State<'_, AppState>,
    session_id: String,
    unit: String,
    action: String,
    sudo: Option<bool>,
) -> Result<Value, String> {
    let cmd = server_tools::build_service_command(&unit, &action, sudo.unwrap_or(false))?;
    let raw = state
        .ssh
        .exec(&session_id, cmd, Some(30_000))
        .await
        .map_err(|e| format!("{e:#}"))?;
    let out = exec_output(&raw);
    let code = exec_code(&raw).unwrap_or(-1);
    if action != "status" && code != 0 {
        if let Some(k) = server_tools::classify_tool_error(&out) {
            return Err(server_tools::reason_text(k));
        }
        return Err(if out.trim().is_empty() {
            "操作失败".into()
        } else {
            out
        });
    }
    Ok(json!({ "code": code, "output": out, "stdout": raw.get("stdout"), "stderr": raw.get("stderr") }))
}

#[tauri::command]
async fn tools_ports(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let raw = state
        .ssh
        .exec(&session_id, server_tools::PORTS_CMD.into(), Some(15_000))
        .await
        .map_err(|e| format!("{e:#}"))?;
    Ok(json!(server_tools::parse_listen_ports(&exec_output(&raw))))
}

#[tauri::command]
async fn tools_df(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let raw = state
        .ssh
        .exec(&session_id, server_tools::DF_CMD.into(), Some(15_000))
        .await
        .map_err(|e| format!("{e:#}"))?;
    let list = server_tools::parse_df(&exec_output(&raw));
    if list.is_empty() {
        return Err("无法读取磁盘用量".into());
    }
    Ok(json!(list))
}

#[tauri::command]
async fn tools_logs(state: State<'_, AppState>, session_id: String, req: Value) -> Result<Value, String> {
    let source = req.get("source").and_then(|x| x.as_str()).unwrap_or("journal");
    let unit = req.get("unit").and_then(|x| x.as_str());
    let path = req.get("path").and_then(|x| x.as_str());
    let lines = req.get("lines").and_then(|x| x.as_u64()).map(|n| n as u32);
    let sudo = req.get("sudo").and_then(|x| x.as_bool()).unwrap_or(false);
    let cmd = server_tools::build_log_command(source, unit, path, lines, sudo)?;
    let raw = state
        .ssh
        .exec(&session_id, cmd, Some(20_000))
        .await
        .map_err(|e| format!("{e:#}"))?;
    let text = exec_output(&raw);
    Ok(json!({
        "text": text,
        "code": exec_code(&raw),
        "at": chrono::Utc::now().timestamp_millis(),
    }))
}

#[tauri::command]
async fn workspace_batch_exec(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let command = payload
        .get("command")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if command.is_empty() || command.contains('\n') || command.contains('\r') || command.len() > 4000 {
        return Ok(json!({ "command": command, "startedAt": chrono::Utc::now().timestamp_millis(), "results": [], "error": "empty-command" }));
    }
    let session_ids: Vec<String> = payload
        .get("sessionIds")
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .take(32)
                .collect()
        })
        .unwrap_or_default();
    if session_ids.is_empty() {
        return Ok(json!({ "command": command, "startedAt": chrono::Utc::now().timestamp_millis(), "results": [], "error": "no-sessions" }));
    }
    let timeout_ms = payload
        .get("timeoutMs")
        .and_then(|x| x.as_u64())
        .unwrap_or(20_000)
        .clamp(1_000, 60_000);
    let started_at = chrono::Utc::now().timestamp_millis();
    let ssh = state.ssh.clone();
    let mut handles = Vec::new();
    for sid in session_ids {
        let ssh = ssh.clone();
        let cmd = command.clone();
        handles.push(tokio::spawn(async move {
            let t0 = std::time::Instant::now();
            match ssh.exec(&sid, cmd, Some(timeout_ms)).await {
                Ok(raw) => {
                    let stdout = raw.get("stdout").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let stderr = raw.get("stderr").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let timed_out = stderr.contains("timeout") && raw.get("code").is_none();
                    let code = raw.get("code").and_then(|x| x.as_i64().or_else(|| x.as_u64().map(|n| n as i64)));
                    let mut stdout = stdout;
                    let mut truncated = false;
                    if stdout.len() > 32_768 {
                        stdout.truncate(32_768);
                        truncated = true;
                    }
                    json!({
                        "sessionId": sid,
                        "label": "",
                        "host": "",
                        "port": 0,
                        "username": "",
                        "ok": code == Some(0),
                        "code": code,
                        "stdout": stdout,
                        "stderr": stderr,
                        "elapsedMs": t0.elapsed().as_millis() as u64,
                        "truncated": truncated,
                        "timedOut": timed_out,
                        "error": if timed_out { Value::String("timeout".into()) } else { Value::Null },
                    })
                }
                Err(e) => {
                    let msg = format!("{e:#}");
                    let err = if msg.contains("session not found") {
                        "not-connected"
                    } else {
                        "exec-failed"
                    };
                    json!({
                        "sessionId": sid,
                        "label": "",
                        "host": "",
                        "port": 0,
                        "username": "",
                        "ok": false,
                        "code": null,
                        "stdout": "",
                        "stderr": "",
                        "elapsedMs": t0.elapsed().as_millis() as u64,
                        "error": err,
                    })
                }
            }
        }));
    }
    let mut results = Vec::new();
    for h in handles {
        match h.await {
            Ok(v) => results.push(v),
            Err(e) => results.push(json!({ "ok": false, "error": format!("join:{e}") })),
        }
    }
    Ok(json!({ "command": command, "startedAt": started_at, "results": results }))
}

#[tauri::command]
async fn workspace_health_probe(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let profile_id = payload
        .get("profileId")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let at = chrono::Utc::now().timestamp_millis();
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
    if reuse.is_empty() {
        return Ok(json!({
            "profileId": profile_id,
            "ok": false,
            "cpu": null,
            "mem": null,
            "disk": null,
            "latencyMs": null,
            "at": at,
            "via": "none",
            "kind": "health-probe",
            "error": "no-session",
            "code": "no-session",
        }));
    }
    let started = std::time::Instant::now();
    match state
        .ssh
        .exec(&reuse, server_tools::RESOURCE_PROBE_CMD.into(), Some(15_000))
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
                "via": "session",
                "kind": "health-probe",
            }))
        }
        Err(e) => Ok(json!({
            "profileId": profile_id,
            "ok": false,
            "cpu": null,
            "mem": null,
            "disk": null,
            "latencyMs": null,
            "at": chrono::Utc::now().timestamp_millis(),
            "via": "none",
            "kind": "health-probe",
            "error": format!("{e:#}"),
            "code": "exec-failed",
        })),
    }
}

#[tauri::command]
fn workspace_health_probe_sweep() -> Value {
    json!({ "ok": true })
}

#[tauri::command]
fn workspace_health_probe_release() -> Value {
    json!({ "ok": true })
}

#[tauri::command]
fn snapshots_list(query: Option<Value>) -> Value {
    snapshots::list_snapshots(query)
}

#[tauri::command]
fn snapshots_stats() -> Value {
    snapshots::stats()
}

#[tauri::command]
fn snapshots_put(input: Value) -> Result<Value, String> {
    snapshots::put(input)
}

#[tauri::command]
fn snapshots_set_prefs(input: Option<Value>) -> Value {
    snapshots::set_prefs(input)
}

#[tauri::command]
fn snapshots_read(id: String) -> Value {
    snapshots::read_one(&id)
}

#[tauri::command]
fn snapshots_pin(id: String, pinned: bool) -> Value {
    snapshots::pin(&id, pinned)
}

#[tauri::command]
fn snapshots_delete(id: String) -> Value {
    snapshots::delete_one(&id)
}

#[tauri::command]
fn snapshots_clear() -> Value {
    snapshots::clear_all()
}

#[tauri::command]
fn snapshots_open_dir() -> Value {
    snapshots::open_dir()
}

#[tauri::command]
fn snapshots_rollback_allowed(level: String) -> bool {
    snapshots::rollback_allowed(&level)
}

#[tauri::command]
fn sessions_export(state: State<'_, AppState>, format: Option<String>) -> Result<String, String> {
    let store = state.store.lock();
    let sessions = store::get_path(&store, &["sessions"]);
    let fmt = format.unwrap_or_else(|| "json".into());
    sessions_io::export_sessions(&sessions, &fmt)
}

#[tauri::command]
fn sessions_import_ssh_config(path: Option<String>) -> Result<Value, String> {
    let parsed = ssh_config::import_ssh_config(path.as_deref())?;
    Ok(sessions_io::ssh_config_to_import_result(parsed))
}

#[tauri::command]
fn sessions_import_pick(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().blocking_pick_files();
    let Some(list) = picked else {
        return Ok(None);
    };
    let mut items = Vec::new();
    let mut notes = Vec::new();
    for fp in list {
        let Ok(path) = fp.into_path() else { continue };
        let Ok(text) = std::fs::read_to_string(&path) else {
            notes.push(format!("无法读取 {}", path.display()));
            continue;
        };
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        let looks_ssh = name == "config"
            || text.lines().any(|l| l.trim().to_ascii_lowercase().starts_with("host "));
        if looks_ssh {
            let parsed = ssh_config::import_ssh_config(Some(path.to_string_lossy().as_ref()))?;
            let mapped = sessions_io::ssh_config_to_import_result(parsed);
            if let Some(arr) = mapped.get("items").and_then(|x| x.as_array()) {
                items.extend(arr.clone());
            }
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            if let Some(arr) = v.get("profiles").and_then(|x| x.as_array()) {
                for p in arr {
                    items.push(p.clone());
                }
                continue;
            }
            if let Some(arr) = v.as_array() {
                items.extend(arr.clone());
                continue;
            }
        }
        notes.push(format!("暂不支持的会话格式: {}", path.display()));
    }
    if items.is_empty() && notes.is_empty() {
        return Ok(None);
    }
    Ok(Some(json!({ "items": items, "notes": notes, "warnings": notes })))
}

#[tauri::command]
fn core_memory_append_episode(session_key: String, text: String, tags: Option<Vec<String>>) -> Value {
    json!(core_memory::append_episode(&session_key, &text, tags.unwrap_or_default()))
}

#[tauri::command]
fn core_memory_set_cite_hold(session_key: String, markers: Vec<String>) -> Value {
    json!(core_memory::set_cite_hold(&session_key, markers))
}

#[tauri::command]
fn core_memory_compress(session_key: String, piece: String, cursor: Option<String>) -> Value {
    core_memory::compress_transcript(&session_key, &piece, cursor)
}

'''

marker = "#[tauri::command]\nfn stub_not_implemented"
if marker not in text:
    raise SystemExit("stub marker missing")
if "fn tools_processes" not in text:
    text = text.replace(marker, cmds + "\n" + marker, 1)

handler_add = """            local_fs_trash,
            local_fs_restore,
            tools_processes,
            tools_kill,
            tools_services,
            tools_service,
            tools_ports,
            tools_df,
            tools_logs,
            workspace_batch_exec,
            workspace_health_probe,
            workspace_health_probe_sweep,
            workspace_health_probe_release,
            snapshots_list,
            snapshots_stats,
            snapshots_put,
            snapshots_set_prefs,
            snapshots_read,
            snapshots_pin,
            snapshots_delete,
            snapshots_clear,
            snapshots_open_dir,
            snapshots_rollback_allowed,
            sessions_export,
            sessions_import_ssh_config,
            sessions_import_pick,
            core_memory_append_episode,
            core_memory_set_cite_hold,
            core_memory_compress,
            stub_ok,"""

if "tools_processes," not in text:
    if "            stub_ok," not in text:
        raise SystemExit("stub_ok not in handler")
    text = text.replace("            stub_ok,", handler_add, 1)

lib.write_text(text, encoding="utf-8")
print("lib.rs patched")
