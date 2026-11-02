use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::known_hosts::{KnownHostEntry, KnownHostsStore};
use crate::store;

fn electron_roaming_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("ai-ssh-pro"))
}

pub fn discover_electron_paths() -> Value {
    let dir = electron_roaming_dir();
    let store = dir.as_ref().map(|d| d.join("ai-ssh-pro.json"));
    let known = dir.as_ref().map(|d| d.join("ai-ssh-pro-known-hosts.json"));
    json!({
        "dir": dir.and_then(|p| p.to_str().map(|s| s.to_string())),
        "store": store.as_ref().and_then(|p| p.to_str().map(|s| s.to_string())),
        "storeExists": store.as_ref().map(|p| p.is_file()).unwrap_or(false),
        "knownHosts": known.as_ref().and_then(|p| p.to_str().map(|s| s.to_string())),
        "knownHostsExists": known.as_ref().map(|p| p.is_file()).unwrap_or(false),
    })
}

pub fn import_from_electron(
    app_store: &mut Value,
    known: &KnownHostsStore,
) -> Result<Value, String> {
    let dir = electron_roaming_dir().ok_or_else(|| "cannot resolve AppData".to_string())?;
    let store_path = dir.join("ai-ssh-pro.json");
    if !store_path.is_file() {
        return Err(format!("Electron store not found: {}", store_path.display()));
    }
    let raw = fs::read_to_string(&store_path).map_err(|e| e.to_string())?;
    let electron: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let mut imported_profiles = 0usize;
    let mut imported_folders = 0usize;
    let mut imported_snippets = 0usize;
    let mut imported_known = 0usize;

    // Merge savedSessions
    if let Some(ss) = electron.get("savedSessions") {
        let mut cur = store::get_path(app_store, &["savedSessions"]);
        if !cur.is_object() {
            cur = json!({ "folders": [], "profiles": [] });
        }
        let mut folders = cur
            .get("folders")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut profiles = cur
            .get("profiles")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let existing_profile_ids: std::collections::HashSet<String> = profiles
            .iter()
            .filter_map(|p| p.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()))
            .collect();
        let existing_folder_ids: std::collections::HashSet<String> = folders
            .iter()
            .filter_map(|p| p.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()))
            .collect();

        if let Some(ef) = ss.get("folders").and_then(|v| v.as_array()) {
            for f in ef {
                let id = f.get("id").and_then(|x| x.as_str()).unwrap_or("");
                if id.is_empty() || existing_folder_ids.contains(id) {
                    continue;
                }
                folders.push(f.clone());
                imported_folders += 1;
            }
        }
        if let Some(ep) = ss.get("profiles").and_then(|v| v.as_array()) {
            for p in ep {
                let id = p.get("id").and_then(|x| x.as_str()).unwrap_or("");
                if id.is_empty() || existing_profile_ids.contains(id) {
                    continue;
                }
                profiles.push(p.clone());
                imported_profiles += 1;
            }
        }
        store::set_path(
            app_store,
            &["savedSessions"],
            json!({ "folders": folders, "profiles": profiles }),
        );
    }

    // Prefer filling empty prefs
    for key in ["ai", "terminalPrefs", "locale"] {
        let cur = store::get_path(app_store, &[key]);
        let empty = match key {
            "locale" => cur.as_str().is_none(),
            _ => cur.as_object().map(|o| o.is_empty()).unwrap_or(true),
        };
        if empty {
            if let Some(v) = electron.get(key) {
                store::set_path(app_store, &[key], v.clone());
            }
        }
    }

    if let Some(sn) = electron.get("snippets").and_then(|v| v.as_array()) {
        let mut cur = store::get_path(app_store, &["snippets"])
            .as_array()
            .cloned()
            .unwrap_or_default();
        let ids: std::collections::HashSet<String> = cur
            .iter()
            .filter_map(|s| s.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()))
            .collect();
        for s in sn {
            let id = s.get("id").and_then(|x| x.as_str()).unwrap_or("");
            if id.is_empty() || ids.contains(id) {
                continue;
            }
            cur.push(s.clone());
            imported_snippets += 1;
        }
        store::set_path(app_store, &["snippets"], Value::Array(cur));
    }

    // Known hosts
    let kh_path = dir.join("ai-ssh-pro-known-hosts.json");
    if kh_path.is_file() {
        if let Ok(s) = fs::read_to_string(&kh_path) {
            if let Ok(v) = serde_json::from_str::<Value>(&s) {
                if let Some(entries_v) = v.get("entries") {
                    if let Ok(map) =
                        serde_json::from_value::<HashMap<String, KnownHostEntry>>(entries_v.clone())
                    {
                        imported_known = known.import_electron_map(&map);
                    }
                }
            }
        }
    }

    store::save_store(app_store)?;
    Ok(json!({
        "ok": true,
        "profiles": imported_profiles,
        "folders": imported_folders,
        "snippets": imported_snippets,
        "knownHosts": imported_known,
        "source": store_path.to_string_lossy(),
    }))
}
