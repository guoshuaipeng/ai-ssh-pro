from pathlib import Path
p = Path("src-tauri/src/lib.rs")
t = p.read_text(encoding="utf-8")
t = t.replace(
"""async fn sync_push(state: State<'_, AppState>, passphrase: String) -> Value {
    let payload = state.store.lock().clone();
    sync::push_sync(payload, passphrase).await
}""",
"""async fn sync_push(state: State<'_, AppState>, passphrase: String) -> Result<Value, String> {
    let payload = state.store.lock().clone();
    Ok(sync::push_sync(payload, passphrase).await)
}""")
t = t.replace(
"""async fn sync_pull(state: State<'_, AppState>, passphrase: String) -> Value {
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
    result
}""",
"""async fn sync_pull(state: State<'_, AppState>, passphrase: String) -> Result<Value, String> {
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
}""")
# app_check_update might also need Result if it takes Option refs - opts is owned Option so OK
# sync_test is async without State - OK for Value
p.write_text(t, encoding="utf-8")
print("sync Result fixed")
