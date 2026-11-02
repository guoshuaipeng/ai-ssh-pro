mod forward;
mod hostkey;
mod import_electron;
mod known_hosts;
mod local_shell;
mod ssh;
mod store;

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::State;

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
}

impl AppState {
    pub fn new() -> Self {
        let known = Arc::new(KnownHostsStore::load());
        let waiters = Arc::new(HostKeyWaiters::new());
        let forwards = Arc::new(ForwardManager::new());
        Self {
            ssh: Arc::new(ssh::SshManager::new(
                known.clone(),
                waiters.clone(),
                forwards.clone(),
            )),
            local: Arc::new(LocalShellManager::new()),
            store: Mutex::new(store::load_store()),
            known,
            waiters,
            forwards,
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
fn app_check_update() -> Value {
    json!({
        "ok": false,
        "hasUpdate": false,
        "message": "Updater not ported to Tauri yet"
    })
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
    state.known.remove_by_key(&host_port)
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
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_download(&session_id, remote_path, local_path)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn sftp_upload(
    state: State<'_, AppState>,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_upload(&session_id, local_path, remote_path)
        .await
        .map_err(|e| format!("{:#}", e))
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
            forwards_list,
            forwards_add,
            forwards_remove,
            electron_store_discover,
            electron_store_import,
            stub_ok,
            stub_null,
            stub_empty_array,
            stub_empty_object,
            stub_not_implemented,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI-SSH-Pro (Tauri)");
}
