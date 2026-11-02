mod agent;
mod ai;
mod backup;
mod dialogs;
mod docker;
mod forward;
mod hostkey;
mod import_electron;
mod known_hosts;
mod local_shell;
mod recording;
mod ssh;
mod store;
mod known_hosts_lookup;
mod updater;
mod sync;
mod inventory;
mod core_memory;
mod jump_probe;
mod local_fs;
mod server_tools;
mod snapshots;
mod ssh_config;
mod sessions_io;

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{Emitter, State};

use crate::forward::{ActiveForward, ForwardManager, ForwardSpec};
use crate::hostkey::HostKeyWaiters;
use crate::known_hosts::KnownHostsStore;
use crate::local_shell::LocalShellManager;

pub struct AppState {
    pub ssh: Arc<ssh::SshManager>,
    pub local: Arc<LocalShellManager>,
    pub store: Mutex<Value>,
    pub known: Arc<KnownHostsStore>,
    pub waiters: Arc<HostKeyWaiters>,
    pub forwards: Arc<ForwardManager>,
    pub ai: ai::SharedAi,
    pub agent: agent::SharedAgent,
    pub recordings: recording::SharedRecordings,
    pub docker_watches: Mutex<std::collections::HashMap<String, Arc<std::sync::atomic::AtomicBool>>>,
}

impl AppState {
    pub fn new() -> Self {
        let known = Arc::new(KnownHostsStore::load());
        let waiters = Arc::new(HostKeyWaiters::new());
        let forwards = Arc::new(ForwardManager::new());
        let remote_routes = Arc::new(crate::forward::RemoteForwardRouter::new());
        let recordings = Arc::new(recording::RecordingRegistry::new());
        recording::set_global(recordings.clone());
        Self {
            ssh: Arc::new(ssh::SshManager::new(
                known.clone(),
                waiters.clone(),
                forwards.clone(),
                remote_routes,
            )),
            local: Arc::new(LocalShellManager::new()),
            store: Mutex::new(store::load_store()),
            known,
            waiters,
            forwards,
            ai: Arc::new(ai::AiRuntime::new()),
            agent: Arc::new(agent::AgentRuntime::new()),
            recordings,
            docker_watches: Mutex::new(std::collections::HashMap::new()),
        }
    }
}

#[tauri::command]
fn app_get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn app_open_external(url: String) -> Result<bool, String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn app_open_github() -> Result<bool, String> {
    app_open_external("https://github.com/guoshuaipeng/ai-ssh-pro".into()).await
}

#[tauri::command]
fn app_get_mcp_guide() -> Value {
    json!({
        "title": "MCP",
        "body": "MCP inventory guide is not fully ported to Tauri yet.",
        "command": "npm run mcp:inventory"
    })
}

#[tauri::command]
fn app_set_ui_chrome(_chrome: Value) -> bool {
    true
}

#[tauri::command]
fn app_focus() -> bool {
    true
}

#[tauri::command]
async fn app_check_update(opts: Option<Value>) -> Value {
    updater::check_update(opts).await
}

#[tauri::command]
fn store_get(state: State<'_, AppState>, path: Vec<String>) -> Value {
    let store = state.store.lock();
    let refs: Vec<&str> = path.iter().map(|s| s.as_str()).collect();
    store::get_path(&store, &refs)
}

#[tauri::command]
fn store_set(state: State<'_, AppState>, path: Vec<String>, value: Value) -> Result<(), String> {
    let mut store = state.store.lock();
    let refs: Vec<&str> = path.iter().map(|s| s.as_str()).collect();
    store::set_path(&mut store, &refs, value);
    store::save_store(&store)
}

#[tauri::command]
fn sessions_list(state: State<'_, AppState>) -> Value {
    let store = state.store.lock();
    store::get_path(&store, &["savedSessions"])
}

#[tauri::command]
fn sessions_save(state: State<'_, AppState>, value: Value) -> Result<(), String> {
    let mut store = state.store.lock();
    store::set_path(&mut store, &["savedSessions"], value);
    store::save_store(&store)
}

#[tauri::command]
async fn ssh_connect(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    opts: ssh::SshConnectOptions,
) -> Result<ssh::SshConnectResult, String> {
    state
        .ssh
        .connect(app, opts)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn ssh_disconnect(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    if session_id.starts_with("local:") {
        return state
            .local
            .disconnect(&session_id)
            .await
            .map_err(|e| format!("{:#}", e));
    }
    state
        .ssh
        .disconnect(&session_id)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn ssh_write(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<bool, String> {
    if session_id.starts_with("local:") {
        return state
            .local
            .write(&session_id, &data)
            .await
            .map_err(|e| format!("{:#}", e));
    }
    state
        .ssh
        .write(&session_id, data)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn ssh_resize(
    state: State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<bool, String> {
    if session_id.starts_with("local:") {
        return state
            .local
            .resize(&session_id, cols, rows)
            .await
            .map_err(|e| format!("{:#}", e));
    }
    state
        .ssh
        .resize(&session_id, cols, rows)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn ssh_get_snapshot(
    state: State<'_, AppState>,
    session_id: String,
    options: Option<Value>,
) -> Result<Option<String>, String> {
    let max = options.and_then(|o| {
        if let Some(n) = o.as_u64() {
            Some(n as usize)
        } else {
            o.get("maxChars")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
        }
    });
    if session_id.starts_with("local:") {
        return Ok(state.local.snapshot(&session_id, max).await);
    }
    state
        .ssh
        .snapshot(&session_id, max)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn ssh_exec(
    state: State<'_, AppState>,
    session_id: String,
    command: String,
    timeout_ms: Option<u64>,
) -> Result<Value, String> {
    if session_id.starts_with("local:") {
        return Err("exec is not supported on local shell".into());
    }
    state
        .ssh
        .exec(&session_id, command, timeout_ms)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
fn ssh_is_local_shell_available() -> bool {
    LocalShellManager::is_available()
}

#[tauri::command]
async fn ssh_open_local_shell(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    opts: Option<Value>,
) -> Result<ssh::SshConnectResult, String> {
    let cols = opts
        .as_ref()
        .and_then(|o| o.get("termCols"))
        .and_then(|v| v.as_u64())
        .unwrap_or(120) as u32;
    let rows = opts
        .as_ref()
        .and_then(|o| o.get("termRows"))
        .and_then(|v| v.as_u64())
        .unwrap_or(32) as u32;
    let cwd = opts
        .as_ref()
        .and_then(|o| o.get("cwd"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    state
        .local
        .open(app, cols, rows, cwd)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
fn ssh_respond_host_key(state: State<'_, AppState>, payload: Value) -> bool {
    let request_id = payload
        .get("requestId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let accept = payload
        .get("accept")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let always = payload
        .get("alwaysTrust")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    state.waiters.resolve(request_id, accept, always)
}

#[tauri::command]
fn known_hosts_list(state: State<'_, AppState>) -> Value {
    json!(state.known.list())
}

#[tauri::command]
fn known_hosts_remove(state: State<'_, AppState>, host_port: String) -> bool {
    let ok = state.known.remove_by_key(&host_port);
    crate::known_hosts_lookup::invalidate_cache();
    ok
}

#[tauri::command]
fn known_hosts_apply_import(
    state: State<'_, AppState>,
    rows: Vec<Value>,
) -> Value {
    let mut ok = 0;
    let mut fail = 0;
    for row in rows {
        let host = row.get("host").and_then(|v| v.as_str()).unwrap_or("");
        let port = row.get("port").and_then(|v| v.as_u64()).unwrap_or(22) as u16;
        let b64 = row
            .get("hostKeyBase64")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        match state.known.trust_base64(host, port, b64) {
            Ok(_) => ok += 1,
            Err(_) => fail += 1,
        }
    }
    crate::known_hosts_lookup::invalidate_cache();
    json!({ "ok": ok, "fail": fail })
}

#[tauri::command]
async fn sftp_list(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<Value, String> {
    state
        .ssh
        .sftp_list(&session_id, remote_path)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_home(state: State<'_, AppState>, session_id: String) -> Result<String, String> {
    state
        .ssh
        .sftp_home(&session_id)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_mkdir(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_mkdir(&session_id, remote_path)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_remove(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_remove(&session_id, remote_path)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_rename(
    state: State<'_, AppState>,
    session_id: String,
    from_path: String,
    to_path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_rename(&session_id, from_path, to_path)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_stat(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<Option<Value>, String> {
    state
        .ssh
        .sftp_stat(&session_id, remote_path)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_download(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_download(app, &session_id, remote_path, local_path)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_upload(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_upload(app, &session_id, local_path, remote_path)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_chmod(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    mode: u32,
) -> Result<(), String> {
    state
        .ssh
        .sftp_chmod(&session_id, remote_path, mode)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    payload: Value,
) -> Result<(), String> {
    let settings_val = {
        let store = state.store.lock();
        store.get("ai").cloned().unwrap_or(json!({
            "providers": [],
            "activeProviderId": "",
            "model": "",
            "temperature": 0.1
        }))
    };
    let settings: ai::AiSettings =
        serde_json::from_value(settings_val).map_err(|e| e.to_string())?;
    let chat: ai::AiChatPayload =
        serde_json::from_value(payload).map_err(|e| e.to_string())?;
    if settings.use_open_claw.unwrap_or(true) {
        state
            .agent
            .run(app, state.ssh.clone(), settings, chat)
            .await
            .map_err(|e| format!("{:#}", e))
    } else {
        state
            .ai
            .chat(app, settings, chat)
            .await
            .map_err(|e| format!("{:#}", e))
    }
}

#[tauri::command]
fn ai_abort_chat(state: State<'_, AppState>) -> bool {
    state.ai.abort();
    state.agent.abort();
    true
}

#[tauri::command]
async fn ai_test_provider(state: State<'_, AppState>, provider: Value) -> Result<Value, String> {
    let p: ai::AiProvider = serde_json::from_value(provider).map_err(|e| e.to_string())?;
    Ok(state.ai.test_provider(p).await)
}

#[tauri::command]
async fn sftp_read_text(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    max_bytes: Option<u64>,
) -> Result<Value, String> {
    state
        .ssh
        .sftp_read_text(&session_id, remote_path, max_bytes)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_write_text(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    content: String,
) -> Result<bool, String> {
    state
        .ssh
        .sftp_write_text(&session_id, remote_path, content)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn forwards_list(
    state: State<'_, AppState>,
    session_id: Option<String>,
) -> Result<Vec<ActiveForward>, String> {
    Ok(state.forwards.list(session_id.as_deref()).await)
}

#[tauri::command]
async fn forwards_add(
    state: State<'_, AppState>,
    req: Value,
) -> Result<ActiveForward, String> {
    let session_id = req
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "sessionId required".to_string())?
        .to_string();
    let spec = ForwardSpec {
        direction: req
            .get("direction")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        local_host: req
            .get("localHost")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        local_port: req
            .get("localPort")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u16,
        remote_host: req
            .get("remoteHost")
            .and_then(|v| v.as_str())
            .unwrap_or("127.0.0.1")
            .to_string(),
        remote_port: req
            .get("remotePort")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u16,
    };
    state
        .ssh
        .add_forward(session_id, spec)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn forwards_remove(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    Ok(state.forwards.remove(&id).await)
}

#[tauri::command]
fn electron_store_discover() -> Value {
    import_electron::discover_electron_paths()
}

#[tauri::command]
fn electron_store_import(state: State<'_, AppState>) -> Result<Value, String> {
    let mut store = state.store.lock();
    import_electron::import_from_electron(&mut store, &state.known)
}

#[tauri::command]
async fn docker_list_tree(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    docker::list_tree(&state.ssh, &session_id)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn docker_container_action(
    state: State<'_, AppState>,
    session_id: String,
    container_id: String,
    action: String,
) -> Result<bool, String> {
    docker::container_action(&state.ssh, &session_id, &container_id, &action)
        .await
        .map_err(|e| format!("{:#}", e))?;
    Ok(true)
}

#[tauri::command]
async fn docker_logs(
    state: State<'_, AppState>,
    session_id: String,
    container_id: String,
    tail: Option<u32>,
) -> Result<String, String> {
    docker::container_logs(&state.ssh, &session_id, &container_id, tail)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn docker_inspect(
    state: State<'_, AppState>,
    session_id: String,
    container_id: String,
) -> Result<Value, String> {
    docker::inspect_container(&state.ssh, &session_id, &container_id)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn docker_compose_ps(
    state: State<'_, AppState>,
    session_id: String,
    project: String,
) -> Result<Value, String> {
    docker::compose_ps(&state.ssh, &session_id, &project)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn docker_compose_action(
    state: State<'_, AppState>,
    session_id: String,
    project: String,
    action: String,
) -> Result<bool, String> {
    docker::compose_action(&state.ssh, &session_id, &project, &action)
        .await
        .map_err(|e| format!("{:#}", e))?;
    Ok(true)
}

#[tauri::command]
fn backup_export(app: tauri::AppHandle, state: State<'_, AppState>, raw: Value) -> Value {
    let password = raw
        .get("password")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let include_ai = raw
        .get("includeAi")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let store = state.store.lock();
    backup::export_backup(&app, &store, &password, include_ai)
}

#[tauri::command]
fn backup_import(app: tauri::AppHandle, state: State<'_, AppState>, raw: Value) -> Value {
    let password = raw
        .get("password")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let mut store = state.store.lock();
    backup::import_backup(&app, &mut store, &password)
}

#[tauri::command]
fn ssh_start_recording(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    opts: Option<Value>,
) -> Result<Option<String>, String> {
    recording::start_recording_cmd(&app, &state.recordings, &session_id, opts.as_ref())
}

#[tauri::command]
fn ssh_stop_recording(state: State<'_, AppState>, session_id: String) -> bool {
    state.recordings.stop(&session_id)
}

#[tauri::command]
fn recordings_list() -> Value {
    recording::list_recordings()
}

#[tauri::command]
fn recordings_read(file: String) -> Result<String, String> {
    recording::read_recording(&file)
}

#[tauri::command]
fn recordings_delete(file: String) -> Result<bool, String> {
    recording::delete_recording(&file)
}

#[tauri::command]
async fn ai_assist(state: State<'_, AppState>, req: Value) -> Result<Value, String> {
    let settings_val = {
        let store = state.store.lock();
        store::get_path(&store, &["ai"])
    };
    let settings: ai::AiSettings =
        serde_json::from_value(settings_val).map_err(|e| e.to_string())?;
    Ok(state.ai.assist(settings, req).await)
}

#[tauri::command]
fn ai_abort_assist(state: State<'_, AppState>, request_id: Option<String>) {
    if let Some(id) = request_id {
        state.ai.abort_assist(&id);
    }
}

#[tauri::command]
async fn ai_parse_ssh(state: State<'_, AppState>, text: String) -> Result<Value, String> {
    let settings_val = {
        let store = state.store.lock();
        store::get_path(&store, &["ai"])
    };
    let settings: ai::AiSettings =
        serde_json::from_value(settings_val).map_err(|e| e.to_string())?;
    state
        .ai
        .parse_ssh(settings, text)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
fn sftp_pick_download_path(app: tauri::AppHandle, default_name: Option<String>) -> Option<String> {
    dialogs::sftp_pick_download_path(&app, default_name)
}

#[tauri::command]
fn sftp_pick_upload_files(app: tauri::AppHandle) -> Option<Vec<String>> {
    dialogs::sftp_pick_upload_files(&app)
}

#[tauri::command]
fn sftp_pick_save_paths(app: tauri::AppHandle, names: Vec<String>) -> Option<Vec<String>> {
    dialogs::sftp_pick_save_paths(&app, names)
}

#[tauri::command]
fn sftp_queue_load() -> Value {
    dialogs::sftp_queue_load()
}

#[tauri::command]
fn sftp_queue_save(tasks: Value) -> Value {
    dialogs::sftp_queue_save(tasks)
}

#[tauri::command]
fn known_hosts_pick_import(app: tauri::AppHandle, state: State<'_, AppState>) -> Option<Value> {
    dialogs::known_hosts_pick_import(&app, &state.known)
}


#[tauri::command]
fn stub_ok() -> bool {
    true
}

#[tauri::command]
fn stub_null() -> Option<Value> {
    None
}

#[tauri::command]
fn stub_empty_array() -> Value {
    json!([])
}

#[tauri::command]
fn stub_empty_object() -> Value {
    json!({})
}

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
fn known_hosts_lookup_host(
    host: String,
    port: Option<u16>,
    file_path: Option<String>,
) -> Value {
    crate::known_hosts_lookup::lookup_host(host, port, file_path)
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
async fn sync_push(state: State<'_, AppState>, passphrase: String) -> Result<Value, String> {
    let payload = state.store.lock().clone();
    Ok(sync::push_sync(payload, passphrase).await)
}

#[tauri::command]
async fn sync_pull(state: State<'_, AppState>, passphrase: String) -> Result<Value, String> {
    let result = sync::pull_sync(passphrase).await;
    if result.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        if let Some(data) = result.get("payload").cloned() {
            if let Some(obj) = data.as_object() {
                let mut store = state.store.lock();
                for (k, v) in obj {
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
    Ok(result)
}

#[tauri::command]
fn sync_backup_local(state: State<'_, AppState>) -> Value {
    let payload = state.store.lock().clone();
    sync::backup_local(&payload)
}


#[tauri::command]
async fn ssh_probe_jump(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    opts: ssh::SshConnectOptions,
) -> Result<Value, String> {
    let rows = jump_probe::probe_jump_chain(Some(app), state.known.clone(), opts)
        .await
        .map_err(|e| format!("{e:#}"))?;
    Ok(jump_probe::probe_to_value(rows))
}

#[tauri::command]
fn inventory_list() -> Value {
    inventory::list()
}

#[tauri::command]
fn inventory_get(id: String) -> Value {
    match inventory::get(&id) {
        Some(h) => serde_json::to_value(h).unwrap_or(Value::Null),
        None => Value::Null,
    }
}

#[tauri::command]
fn inventory_search(query: String) -> Value {
    inventory::search(&query)
}

#[tauri::command]
fn inventory_upsert(input: Value) -> Result<Value, String> {
    inventory::upsert(input).map(|h| serde_json::to_value(h).unwrap_or(Value::Null))
}

#[tauri::command]
fn inventory_remove(id: String) -> bool {
    inventory::remove(&id)
}

#[tauri::command]
fn inventory_set_services(host_id: String, services: Value) -> Result<Value, String> {
    inventory::set_services(&host_id, services)
        .map(|h| serde_json::to_value(h).unwrap_or(Value::Null))
}

#[tauri::command]
fn inventory_append_note(host_id: String, note: String) -> Result<Value, String> {
    inventory::append_note(&host_id, &note)
        .map(|h| serde_json::to_value(h).unwrap_or(Value::Null))
}

#[tauri::command]
fn inventory_upsert_service(host_id: String, service: Value) -> Result<Value, String> {
    inventory::upsert_service(&host_id, service)
        .map(|h| serde_json::to_value(h).unwrap_or(Value::Null))
}

#[tauri::command]
fn inventory_format_context(host_id: Option<String>, host: Option<String>, port: Option<u16>) -> String {
    inventory::format_context(host_id.as_deref(), host.as_deref(), port)
}

#[tauri::command]
fn core_memory_get(session_key: String) -> Value {
    core_memory::as_json(&session_key)
}

#[tauri::command]
fn core_memory_context(session_key: String) -> String {
    core_memory::context_for_prompt(&session_key)
}

#[tauri::command]
fn core_memory_set_goal(session_key: String, goal: String) -> bool {
    core_memory::set_working_goal(&session_key, &goal);
    true
}

#[tauri::command]
fn core_memory_archive_goal(session_key: String, goal: Option<String>) -> bool {
    let g = goal.unwrap_or_else(|| {
        core_memory::get_thread(&session_key)
            .working_memory
            .map(|w| w.goal)
            .unwrap_or_default()
    });
    core_memory::archive_goal(&session_key, &g);
    true
}

#[tauri::command]
fn core_memory_clear_working(session_key: String) -> bool {
    core_memory::clear_working(&session_key);
    true
}

#[tauri::command]
fn known_hosts_lookup_hosts_bulk(hosts: Vec<Value>, file_path: Option<String>) -> Value {
    known_hosts_lookup::lookup_hosts_bulk(hosts, file_path)
}


#[tauri::command]
fn local_fs_home() -> String {
    local_fs::home()
}

#[tauri::command]
fn local_fs_drives() -> Value {
    local_fs::drives()
}

#[tauri::command]
fn local_fs_list(dir: Option<String>) -> Result<Value, String> {
    local_fs::list(dir)
}

#[tauri::command]
fn local_fs_stat(target: String) -> Value {
    local_fs::stat(target).unwrap_or(Value::Null)
}

#[tauri::command]
fn local_fs_mkdir(target: String) -> Result<bool, String> {
    local_fs::mkdir(target)
}

#[tauri::command]
fn local_fs_rename(from: String, to: String) -> Result<bool, String> {
    local_fs::rename(from, to)
}

#[tauri::command]
fn local_fs_reveal(target: String) -> bool {
    local_fs::reveal(target)
}

#[tauri::command]
fn local_fs_open(target: String) -> Result<String, String> {
    local_fs::open_path(target)
}

#[tauri::command]
fn local_fs_read_text(target: String, max_bytes: Option<usize>) -> Value {
    local_fs::read_text(target, max_bytes)
}

#[tauri::command]
fn local_fs_write_text(target: String, content: String) -> Result<bool, String> {
    local_fs::write_text(target, content)
}

#[tauri::command]
fn local_fs_write_bytes_b64(target: String, b64: String) -> Result<bool, String> {
    local_fs::write_bytes_b64(target, b64)
}

#[tauri::command]
fn local_fs_list_keys() -> Value {
    local_fs::list_local_keys()
}

#[tauri::command]
fn local_fs_open_ssh_dir() -> bool {
    local_fs::open_ssh_dir()
}

#[tauri::command]
fn files_pick_save_text(app: tauri::AppHandle, default_name: Option<String>) -> Option<String> {
    dialogs::pick_save_text(&app, default_name)
}

#[tauri::command]
fn files_save_text(app: tauri::AppHandle, default_name: Option<String>, content: String) -> Result<Option<String>, String> {
    let Some(path) = dialogs::pick_save_text(&app, default_name) else {
        return Ok(None);
    };
    local_fs::write_text(path.clone(), content)?;
    Ok(Some(path))
}

#[tauri::command]
fn files_reveal(target: String) -> bool {
    local_fs::reveal(target)
}

#[tauri::command]
fn pick_private_key(app: tauri::AppHandle) -> Option<String> {
    dialogs::pick_private_key(&app)
}

#[tauri::command]
fn pick_certificate(app: tauri::AppHandle) -> Option<String> {
    dialogs::pick_certificate(&app)
}

#[tauri::command]
fn core_memory_list_threads() -> Value {
    core_memory::list_threads()
}

#[tauri::command]
fn core_memory_bump_epoch(session_key: String) -> u64 {
    core_memory::bump_epoch(&session_key)
}

#[tauri::command]
fn core_memory_append_observations(session_key: String, texts: Vec<String>) -> Value {
    json!(core_memory::append_observations(&session_key, texts))
}

#[tauri::command]
fn sync_get_base() -> Value {
    sync::load_base()
}

#[tauri::command]
fn sync_set_base(base: Value) -> Value {
    sync::save_base(base)
}

#[tauri::command]
fn sync_find_conflicts(local: Vec<Value>, remote: Vec<Value>, base: Option<Value>) -> Value {
    sync::find_conflicts(local, remote, base)
}

#[tauri::command]
fn sync_schedule_status() -> Value {
    sync::schedule_status()
}

#[tauri::command]
fn sync_schedule_tick(result: Option<Value>) -> Value {
    sync::record_schedule_tick(result.unwrap_or(json!({ "ok": false, "note": "tick-only" })))
}


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


#[tauri::command]
fn stub_not_implemented(feature: String) -> Result<Value, String> {
    Err(format!("{feature} is not yet implemented in the Tauri build"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(30));
                    let st = sync::schedule_status();
                    let enabled = st.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
                    let minutes = st.get("minutes").and_then(|v| v.as_u64()).unwrap_or(0);
                    if !enabled || minutes == 0 {
                        continue;
                    }
                    let last = st.get("lastTickAt").and_then(|v| v.as_i64()).unwrap_or(0);
                    let now = chrono::Utc::now().timestamp_millis();
                    let due_ms = (minutes as i64).saturating_mul(60_000);
                    if last > 0 && now - last < due_ms {
                        continue;
                    }
                    let _ = handle.emit(
                        "sync:scheduleTick",
                        serde_json::json!({
                            "at": now,
                            "minutes": minutes,
                            "note": "local schedule skeleton — call sync.push/pull with user passphrase if configured"
                        }),
                    );
                    let _ = sync::record_schedule_tick(serde_json::json!({
                        "ok": true,
                        "kind": "tick",
                        "at": now
                    }));
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_get_version,
            app_open_external,
            app_open_github,
            app_get_mcp_guide,
            app_set_ui_chrome,
            app_focus,
            app_check_update,
            store_get,
            store_set,
            sessions_list,
            sessions_save,
            ssh_connect,
            ssh_disconnect,
            ssh_write,
            ssh_resize,
            ssh_get_snapshot,
            ssh_exec,
            ssh_is_local_shell_available,
            ssh_open_local_shell,
            ssh_respond_host_key,
            known_hosts_list,
            known_hosts_remove,
            known_hosts_apply_import,
            sftp_list,
            sftp_home,
            sftp_mkdir,
            sftp_remove,
            sftp_rename,
            sftp_stat,
            sftp_download,
            sftp_upload,
            sftp_read_text,
            sftp_write_text,
            sftp_chmod,
            ai_chat,
            ai_abort_chat,
            ai_test_provider,
            forwards_list,
            forwards_add,
            forwards_remove,
            electron_store_discover,
            electron_store_import,
            docker_list_tree,
            docker_container_action,
            docker_logs,
            docker_inspect,
            docker_compose_ps,
            docker_compose_action,
            backup_export,
            backup_import,
            ssh_start_recording,
            ssh_stop_recording,
            recordings_list,
            recordings_read,
            recordings_delete,
            ai_assist,
            ai_abort_assist,
            ai_parse_ssh,
            sftp_pick_download_path,
            sftp_pick_upload_files,
            sftp_pick_save_paths,
            sftp_queue_load,
            sftp_queue_save,
            known_hosts_pick_import,
            ai_resolve_confirm,
            sftp_transfer,
            docker_swarm_inspect,
            docker_swarm_logs,
            docker_swarm_action,
            docker_watch_events,
            docker_unwatch_events,
            docker_open_shell,
            known_hosts_lookup_host,
            sync_get_config,
            sync_set_config,
            sync_test,
            sync_push,
            sync_pull,
            sync_backup_local,
            ssh_probe_jump,
            inventory_list,
            inventory_get,
            inventory_search,
            inventory_upsert,
            inventory_remove,
            inventory_set_services,
            inventory_append_note,
            inventory_upsert_service,
            inventory_format_context,
            core_memory_get,
            core_memory_context,
            core_memory_set_goal,
            core_memory_archive_goal,
            core_memory_clear_working,
            known_hosts_lookup_hosts_bulk,
            local_fs_home,
            local_fs_drives,
            local_fs_list,
            local_fs_stat,
            local_fs_mkdir,
            local_fs_rename,
            local_fs_reveal,
            local_fs_open,
            local_fs_read_text,
            local_fs_write_text,
            local_fs_write_bytes_b64,
            local_fs_list_keys,
            local_fs_open_ssh_dir,
            files_pick_save_text,
            files_save_text,
            files_reveal,
            pick_private_key,
            pick_certificate,
            core_memory_list_threads,
            core_memory_bump_epoch,
            core_memory_append_observations,
            sync_get_base,
            sync_set_base,
            sync_find_conflicts,
            sync_schedule_status,
            sync_schedule_tick,
            local_fs_trash,
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
            stub_ok,
            stub_null,
            stub_empty_array,
            stub_empty_object,
            stub_not_implemented,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI-SSH-Pro (Tauri)");
}
