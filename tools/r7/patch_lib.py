from pathlib import Path

# --- lib.rs mods + commands ---
lib = Path("src-tauri/src/lib.rs")
t = lib.read_text(encoding="utf-8")
if "mod local_fs;" not in t:
    t = t.replace("mod jump_probe;\n", "mod jump_probe;\nmod local_fs;\n")

cmds = r'''
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
'''

if "fn local_fs_home" not in t:
    insert_at = t.find("#[tauri::command]\nfn stub_not_implemented")
    if insert_at < 0:
        insert_at = t.rfind("fn stub_not_implemented")
        insert_at = t.rfind("#[tauri::command]", 0, insert_at)
    t = t[:insert_at] + cmds + "\n" + t[insert_at:]

extra = """            local_fs_home,
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
"""
if "local_fs_home," not in t:
    t = t.replace("            known_hosts_lookup_hosts_bulk,\n", "            known_hosts_lookup_hosts_bulk,\n" + extra)

# Schedule timer on setup - find .setup or run
if "sync:scheduleTick" not in t:
    # Add a lightweight spawn in the run builder before invoke_handler if there's setup
    if ".setup(" not in t:
        t = t.replace(
            "        .invoke_handler(tauri::generate_handler![",
            """        .setup(|app| {
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
        .invoke_handler(tauri::generate_handler![""",
        )
        # need Emitter in scope - already used elsewhere via tauri::Emitter?
        if "use tauri::Emitter" not in t and "Emitter" not in t.split("use tauri")[0]:
            t = t.replace("use tauri::State;", "use tauri::{Emitter, State};")

lib.write_text(t, encoding="utf-8")
print("lib wired", lib.stat().st_size)
