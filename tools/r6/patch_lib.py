from pathlib import Path

lib = Path("src-tauri/src/lib.rs")
t = lib.read_text(encoding="utf-8")

if "mod inventory;" not in t:
    t = t.replace(
        "mod sync;\n",
        "mod sync;\nmod inventory;\nmod core_memory;\nmod jump_probe;\n",
    )

cmds = '''
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
'''

if "fn ssh_probe_jump" not in t:
    # insert before stub_not_implemented
    marker = "#[tauri::command]\nfn stub_not_implemented"
    if marker not in t:
        # find alternate
        idx = t.find("fn stub_not_implemented")
        if idx < 0:
            raise SystemExit("stub marker missing")
        # find #[tauri::command] before it
        marker = t.rfind("#[tauri::command]", 0, idx)
        marker = t[marker: idx + len("fn stub_not_implemented")]
        # simpler: insert before last stub
    insert_at = t.find("#[tauri::command]\nfn stub_not_implemented")
    if insert_at < 0:
        insert_at = t.find("fn stub_not_implemented")
        # go back to attribute
        insert_at = t.rfind("#[tauri::command]", 0, insert_at)
    if insert_at < 0:
        raise SystemExit("cannot find insert point")
    t = t[:insert_at] + cmds + "\n" + t[insert_at:]

# register in generate_handler
extra = """            ssh_probe_jump,
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
"""

if "ssh_probe_jump," not in t:
    t = t.replace(
        "            sync_backup_local,\n",
        "            sync_backup_local,\n" + extra,
    )

lib.write_text(t, encoding="utf-8")
print("lib ok", lib.stat().st_size)
