from pathlib import Path
p = Path("src-tauri/src/lib.rs")
t = p.read_text(encoding="utf-8")
t = t.replace(
'''async fn workspace_health_probe_sweep(state: State<'_, AppState>, idle_ms: Option<u64>) -> Value {
    state.ssh.probe_sweep(idle_ms.unwrap_or(30_000)).await
}

#[tauri::command]
async fn workspace_health_probe_release(state: State<'_, AppState>, profile_id: Option<String>) -> Value {
    state.ssh.probe_release(profile_id).await
}''',
'''async fn workspace_health_probe_sweep(state: State<'_, AppState>, idle_ms: Option<u64>) -> Result<Value, String> {
    Ok(state.ssh.probe_sweep(idle_ms.unwrap_or(30_000)).await)
}

#[tauri::command]
async fn workspace_health_probe_release(state: State<'_, AppState>, profile_id: Option<String>) -> Result<Value, String> {
    Ok(state.ssh.probe_release(profile_id).await)
}''',
1,
)
p.write_text(t, encoding="utf-8")
print("fixed return types")
