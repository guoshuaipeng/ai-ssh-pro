#[tauri::command]
fn ai_resolve_confirm(state: State<'_, AppState>, request_id: String, ok: bool) -> bool {
    state.agent.resolve_confirm(&request_id, ok)
}

#[tauri::command]
async fn sftp_transfer(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    direction: String,
    local_path: String,
    remote_path: String,
    offset: Option<u64>,
) -> Result<(), String> {
    state
        .ssh
        .sftp_transfer(app, &session_id, direction, local_path, remote_path, offset)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn docker_swarm_inspect(
    state: State<'_, AppState>,
    session_id: String,
    service: String,
) -> Result<Value, String> {
    docker::swarm_inspect(&state.ssh, &session_id, &service)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn docker_swarm_logs(
    state: State<'_, AppState>,
    session_id: String,
    service: String,
    tail: Option<u32>,
) -> Result<String, String> {
    docker::swarm_logs(&state.ssh, &session_id, &service, tail)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn docker_swarm_action(
    state: State<'_, AppState>,
    session_id: String,
    service: String,
    action: String,
    replicas: Option<u32>,
) -> Result<bool, String> {
    docker::swarm_action(&state.ssh, &session_id, &service, &action, replicas)
        .await
        .map_err(|e| format!("{:#}", e))?;
    Ok(true)
}

#[tauri::command]
async fn docker_watch_events(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<bool, String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    // stop previous
    if let Some(prev) = state.docker_watches.lock().remove(&session_id) {
        prev.store(true, Ordering::SeqCst);
    }
    let stop = Arc::new(AtomicBool::new(false));
    state
        .docker_watches
        .lock()
        .insert(session_id.clone(), stop.clone());
    state
        .ssh
        .start_docker_events_watch(app, &session_id, stop)
        .await
        .map_err(|e| format!("{:#}", e))?;
    Ok(true)
}

#[tauri::command]
fn docker_unwatch_events(state: State<'_, AppState>, session_id: String) -> bool {
    use std::sync::atomic::Ordering;
    if let Some(prev) = state.docker_watches.lock().remove(&session_id) {
        prev.store(true, Ordering::SeqCst);
    }
    true
}

#[tauri::command]
async fn docker_open_shell(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    container_id: String,
    opts: Option<Value>,
) -> Result<ssh::SshConnectResult, String> {
    let cols = opts
        .as_ref()
        .and_then(|o| o.get("termCols").or_else(|| o.get("cols")))
        .and_then(|v| v.as_u64())
        .map(|n| n as u32);
    let rows = opts
        .as_ref()
        .and_then(|o| o.get("termRows").or_else(|| o.get("rows")))
        .and_then(|v| v.as_u64())
        .map(|n| n as u32);
    let label = opts
        .as_ref()
        .and_then(|o| o.get("label"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    state
        .ssh
        .open_docker_exec(app, &session_id, &container_id, cols, rows, label)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
fn known_hosts_lookup(
    host: String,
    port: Option<u16>,
    file_path: Option<String>,
) -> Value {
    known_hosts_lookup::lookup_host(host, port, file_path)
}

#[tauri::command]
fn sync_get_config() -> Value {
    sync::public_config(sync::load_config().as_ref())
}

#[tauri::command]
fn sync_set_config(patch: Value) -> Value {
    sync::set_config(patch)
}

#[tauri::command]
async fn sync_test() -> Value {
    sync::test_sync().await
}

#[tauri::command]
async fn sync_push(state: State<'_, AppState>, passphrase: String) -> Value {
    let payload = state.store.lock().clone();
    sync::push_sync(payload, passphrase).await
}

#[tauri::command]
async fn sync_pull(state: State<'_, AppState>, passphrase: String) -> Value {
    let result = sync::pull_sync(passphrase).await;
    if result.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        if let Some(data) = result.get("data").cloned() {
            if let Some(obj) = data.as_object() {
                let mut store = state.store.lock();
                for (k, v) in obj {
                    // merge top-level keys from remote backup payload
                    if k == "version" || k == "exportedAt" {
                        continue;
                    }
                    store
                        .as_object_mut()
                        .map(|m| m.insert(k.clone(), v.clone()));
                }
                let _ = store::save_store(&store);
            }
        }
    }
    result
}

#[tauri::command]
fn sync_backup_local(state: State<'_, AppState>) -> Value {
    let payload = state.store.lock().clone();
    sync::backup_local(&payload)
}