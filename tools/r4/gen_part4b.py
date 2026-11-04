from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
lib_path = ROOT / "src-tauri/src/lib.rs"
lib = lib_path.read_text(encoding="utf-8")

# mods
old_mods = """mod ai;
mod forward;
mod hostkey;
mod import_electron;
mod known_hosts;
mod local_shell;
mod ssh;
mod store;"""
new_mods = """mod ai;
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
mod store;"""
if "mod docker;" not in lib:
    if old_mods not in lib:
        raise SystemExit("mods block missing")
    lib = lib.replace(old_mods, new_mods)

# AppState
old_state = """pub struct AppState {
    pub ssh: Arc<ssh::SshManager>,
    pub local: Arc<LocalShellManager>,
    pub store: Mutex<Value>,
    pub known: Arc<KnownHostsStore>,
    pub waiters: Arc<HostKeyWaiters>,
    pub forwards: Arc<ForwardManager>,
    pub ai: ai::SharedAi,
}"""
new_state = """pub struct AppState {
    pub ssh: Arc<ssh::SshManager>,
    pub local: Arc<LocalShellManager>,
    pub store: Mutex<Value>,
    pub known: Arc<KnownHostsStore>,
    pub waiters: Arc<HostKeyWaiters>,
    pub forwards: Arc<ForwardManager>,
    pub ai: ai::SharedAi,
    pub recordings: recording::SharedRecordings,
}"""
if "pub recordings:" not in lib:
    lib = lib.replace(old_state, new_state)

old_new = """        Self {
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
        }"""
new_new = """        let recordings = Arc::new(recording::RecordingRegistry::new());
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
            recordings,
        }"""
if "recording::set_global" not in lib:
    if old_new not in lib:
        raise SystemExit("AppState::new body missing")
    lib = lib.replace(old_new, new_new)

# Insert command handlers before stub_ok
cmds = r'''
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

'''

if "fn docker_list_tree" not in lib:
    if "fn stub_ok() -> bool" not in lib:
        raise SystemExit("stub_ok missing")
    lib = lib.replace("fn stub_ok() -> bool", cmds + "\nfn stub_ok() -> bool")

# generate_handler list
old_handler_tail = """            electron_store_discover,
            electron_store_import,
            stub_ok,"""
new_handler_tail = """            electron_store_discover,
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
            stub_ok,"""
if "docker_list_tree," not in lib:
    if old_handler_tail not in lib:
        raise SystemExit("handler tail missing")
    lib = lib.replace(old_handler_tail, new_handler_tail)

lib_path.write_text(lib, encoding="utf-8")
print("lib.rs patched", lib_path.stat().st_size)