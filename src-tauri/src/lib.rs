mod ssh;
mod store;

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::State;

pub struct AppState {
    pub ssh: Arc<ssh::SshManager>,
    pub store: Mutex<Value>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ssh: Arc::new(ssh::SshManager::new()),
            store: Mutex::new(store::load_store()),
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
    state
        .ssh
        .exec(&session_id, command, timeout_ms)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
fn ssh_is_local_shell_available() -> bool {
    false
}

#[tauri::command]
fn ssh_respond_host_key(_payload: Value) -> bool {
    true
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
    Err(format!("{} is not yet implemented in the Tauri build", feature))
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
            ssh_respond_host_key,
            stub_ok,
            stub_null,
            stub_empty_array,
            stub_empty_object,
            stub_not_implemented,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI-SSH-Pro (Tauri)");
}
