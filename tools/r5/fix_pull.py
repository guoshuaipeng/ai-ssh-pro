from pathlib import Path
p = Path("src-tauri/src/lib.rs")
t = p.read_text(encoding="utf-8")
old = '''async fn sync_pull(state: State<'_, AppState>, passphrase: String) -> Value {
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
}'''
new = '''async fn sync_pull(state: State<'_, AppState>, passphrase: String) -> Value {
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
}'''
if old in t:
    t = t.replace(old, new)
    p.write_text(t, encoding="utf-8")
    print("sync_pull fixed")
elif 'result.get("payload")' in t:
    print("already payload")
else:
    print("NOT FOUND")
    i = t.find("async fn sync_pull")
    print(repr(t[i:i+700]))
