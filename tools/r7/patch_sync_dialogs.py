from pathlib import Path

# --- sync.rs: schedule fields + helpers ---
sp = Path("src-tauri/src/sync.rs")
s = sp.read_text(encoding="utf-8")
if "auto_sync_minutes" not in s:
    s = s.replace(
        """pub struct SyncConfig {
    pub provider: Option<String>,
    pub gist_id: Option<String>,
    pub webdav_url: Option<String>,
    pub username: Option<String>,
    pub token: Option<String>,
    pub password: Option<String>,
    pub sync_passphrase: Option<String>,
    pub scope: Option<SyncScope>,
}""",
        """pub struct SyncConfig {
    pub provider: Option<String>,
    pub gist_id: Option<String>,
    pub webdav_url: Option<String>,
    pub username: Option<String>,
    pub token: Option<String>,
    pub password: Option<String>,
    pub sync_passphrase: Option<String>,
    pub scope: Option<SyncScope>,
    /// Local schedule skeleton (minutes). 0/None = off. Does not invent remote success.
    pub auto_sync_minutes: Option<u64>,
    pub auto_sync_enabled: Option<bool>,
}""",
    )
    s = s.replace(
        """        "scope": c.scope,
        "enabled": true,
        "note": "需自行配置 Gist token 或 WebDAV；密钥仅存本机 sync-config.json"
    })""",
        """        "scope": c.scope,
        "enabled": true,
        "autoSyncMinutes": c.auto_sync_minutes.unwrap_or(0),
        "autoSyncEnabled": c.auto_sync_enabled.unwrap_or(false),
        "note": "需自行配置 Gist token 或 WebDAV；密钥仅存本机 sync-config.json；定时同步仅为本地调度骨架"
    })""",
    )
    # set_config patches
    s = s.replace(
        """    if let Some(scope) = patch.get("scope") {
        if let Ok(s) = serde_json::from_value::<SyncScope>(scope.clone()) {
            prev.scope = Some(s);
        }
    }
    let _ = save_config(&prev);
    public_config(Some(&prev))
}""",
        """    if let Some(scope) = patch.get("scope") {
        if let Ok(s) = serde_json::from_value::<SyncScope>(scope.clone()) {
            prev.scope = Some(s);
        }
    }
    if let Some(v) = patch.get("autoSyncMinutes").and_then(|v| v.as_u64()) {
        prev.auto_sync_minutes = Some(v.min(24 * 60));
    }
    if let Some(v) = patch.get("autoSyncEnabled").and_then(|v| v.as_bool()) {
        prev.auto_sync_enabled = Some(v);
    }
    let _ = save_config(&prev);
    public_config(Some(&prev))
}

fn sync_base_path() -> PathBuf {
    store::data_dir().join("sync-base.json")
}

fn sync_schedule_state_path() -> PathBuf {
    store::data_dir().join("sync-schedule.json")
}

/// Last-synced revision map (id -> updatedAt) for conflict detection.
pub fn load_base() -> Value {
    fs::read_to_string(sync_base_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}))
}

pub fn save_base(base: Value) -> Value {
    let path = sync_base_path();
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    let _ = fs::write(path, serde_json::to_string_pretty(&base).unwrap_or_else(|_| "{}".into()));
    base
}

/// Pure conflict scan (mirrors shared/sync-vault findConflicts). Frontend can also compute;
/// this lets Rust/agent use the same rules on item arrays.
pub fn find_conflicts(local: Vec<Value>, remote: Vec<Value>, base: Option<Value>) -> Value {
    use std::collections::{HashMap, HashSet};
    let base_map: HashMap<String, i64> = base
        .and_then(|b| b.as_object().cloned())
        .map(|o| {
            o.into_iter()
                .filter_map(|(k, v)| v.as_i64().map(|n| (k, n)))
                .collect()
        })
        .unwrap_or_default();
    let mut by_local: HashMap<String, Value> = HashMap::new();
    let mut by_remote: HashMap<String, Value> = HashMap::new();
    for item in local {
        if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
            by_local.insert(id.to_string(), item);
        }
    }
    for item in remote {
        if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
            by_remote.insert(id.to_string(), item);
        }
    }
    let ids: HashSet<String> = by_local.keys().chain(by_remote.keys()).cloned().collect();
    let mut out = Vec::new();
    for id in ids {
        let l = by_local.get(&id);
        let r = by_remote.get(&id);
        let base_at = *base_map.get(&id).unwrap_or(&0);
        let local_changed = l
            .map(|v| v.get("updatedAt").and_then(|x| x.as_i64()).unwrap_or(0) > base_at)
            .unwrap_or(base_at > 0);
        let remote_changed = r
            .map(|v| v.get("updatedAt").and_then(|x| x.as_i64()).unwrap_or(0) > base_at)
            .unwrap_or(base_at > 0);
        if !local_changed || !remote_changed {
            continue;
        }
        let canon = |v: Option<&Value>| -> String {
            match v {
                None => String::new(),
                Some(item) => serde_json::to_string(&json!({
                    "deleted": item.get("deleted").and_then(|d| d.as_bool()).unwrap_or(false),
                    "body": item.get("body"),
                }))
                .unwrap_or_default(),
            }
        };
        if canon(l) == canon(r) {
            continue;
        }
        let deleted = match (l, r) {
            (None, Some(_)) | (Some(_), None) => true,
            (Some(a), Some(b)) => {
                a.get("deleted").and_then(|d| d.as_bool()).unwrap_or(false)
                    != b.get("deleted").and_then(|d| d.as_bool()).unwrap_or(false)
            }
            _ => false,
        };
        let sample = l.or(r).cloned().unwrap_or(json!({}));
        out.push(json!({
            "id": id,
            "kind": sample.get("kind"),
            "name": sample.get("name"),
            "local": l.cloned(),
            "remote": r.cloned(),
            "reason": if deleted || l.is_none() || r.is_none() { "delete-modify" } else { "both-changed" },
        }));
    }
    json!(out)
}

/// Local schedule status. Tick emits `sync:scheduleTick` from lib when enabled; never pretends remote OK.
pub fn schedule_status() -> Value {
    let cfg = load_config();
    let state: Value = fs::read_to_string(sync_schedule_state_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    let enabled = cfg
        .as_ref()
        .and_then(|c| c.auto_sync_enabled)
        .unwrap_or(false);
    let minutes = cfg.as_ref().and_then(|c| c.auto_sync_minutes).unwrap_or(0);
    json!({
        "enabled": enabled && minutes > 0,
        "minutes": minutes,
        "lastTickAt": state.get("lastTickAt").cloned().unwrap_or(Value::Null),
        "lastResult": state.get("lastResult").cloned().unwrap_or(Value::Null),
        "note": "骨架：到点只发 sync:scheduleTick；真正 push/pull 仍需用户 token 与口令",
    })
}

pub fn record_schedule_tick(result: Value) -> Value {
    let path = sync_schedule_state_path();
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    let payload = json!({
        "lastTickAt": chrono::Utc::now().timestamp_millis(),
        "lastResult": result,
    });
    let _ = fs::write(path, serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into()));
    schedule_status()
}""",
    )
    sp.write_text(s, encoding="utf-8")
    print("sync extended")
else:
    print("sync already")

# --- dialogs: pick private key / cert ---
dp = Path("src-tauri/src/dialogs.rs")
d = dp.read_text(encoding="utf-8")
if "pick_private_key" not in d:
    d += """

pub fn pick_private_key(app: &AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("SSH private key", &["", "pem", "key"])
        .blocking_pick_file()
        .and_then(path_str)
}

pub fn pick_certificate(app: &AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("Certificate", &["crt", "pem", "cer", "pub"])
        .blocking_pick_file()
        .and_then(path_str)
}

pub fn pick_save_text(app: &AppHandle, default_name: Option<String>) -> Option<String> {
    let name = default_name.unwrap_or_else(|| "export.txt".into());
    app.dialog()
        .file()
        .set_file_name(name)
        .blocking_save_file()
        .and_then(path_str)
}
"""
    dp.write_text(d, encoding="utf-8")
    print("dialogs extended")
else:
    print("dialogs already")
