use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    // Same folder as Electron (`%APPDATA%\ai-ssh-pro` on Windows; case-insensitive).
    // Electron used `ai-ssh-pro.json`; Tauri uses `store.json` beside it.
    let dir = base.join("AI-SSH-Pro");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn store_path() -> PathBuf {
    data_dir().join("store.json")
}

fn electron_store_path() -> PathBuf {
    data_dir().join("ai-ssh-pro.json")
}

/// If Tauri `store.json` is missing or has zero profiles, copy sessions/settings
/// from the sibling Electron `ai-ssh-pro.json` (same AppData folder on Windows).

fn heal_ai_from_electron(mut store: Value, electron_path: &PathBuf) -> Value {
    if !electron_path.is_file() {
        return store;
    }
    let cur = get_path(&store, &["ai"]);
    if crate::secret_crypto::ai_has_usable_key(&cur) {
        // Prefer decrypting in place so chat gets plaintext even if already "imported".
        let decrypted = crate::secret_crypto::decrypt_ai_settings(cur.clone());
        if decrypted != cur {
            set_path(&mut store, &["ai"], decrypted);
            let _ = save_store(&store);
        }
        return store;
    }
    let Ok(raw) = fs::read_to_string(electron_path) else {
        return store;
    };
    let Ok(electron) = serde_json::from_str::<Value>(&raw) else {
        return store;
    };
    if let Some(ai) = electron.get("ai") {
        if crate::secret_crypto::ai_has_usable_key(ai) {
            let decrypted = crate::secret_crypto::decrypt_ai_settings(ai.clone());
            set_path(&mut store, &["ai"], decrypted);
            let _ = save_store(&store);
            eprintln!(
                "[ai-ssh-pro] healed AI settings from Electron store {}",
                electron_path.display()
            );
        }
    }
    store
}

fn maybe_auto_import_from_electron(mut store: Value) -> Value {
    let electron_path = electron_store_path();
    if !electron_path.is_file() {
        return store;
    }
    let profile_count = store
        .get("savedSessions")
        .and_then(|s| s.get("profiles"))
        .and_then(|p| p.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if profile_count > 0 {
        // Profiles already imported — still heal AI when Tauri store lost providers/keys.
        return heal_ai_from_electron(store, &electron_path);
    }
    let Ok(raw) = fs::read_to_string(&electron_path) else {
        return store;
    };
    let Ok(electron) = serde_json::from_str::<Value>(&raw) else {
        return store;
    };

    let mut folders = store
        .get("savedSessions")
        .and_then(|s| s.get("folders"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut profiles = store
        .get("savedSessions")
        .and_then(|s| s.get("profiles"))
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

    if let Some(ss) = electron.get("savedSessions") {
        if let Some(ef) = ss.get("folders").and_then(|v| v.as_array()) {
            for f in ef {
                let id = f.get("id").and_then(|x| x.as_str()).unwrap_or("");
                if id.is_empty() || existing_folder_ids.contains(id) {
                    continue;
                }
                folders.push(f.clone());
            }
        }
        if let Some(ep) = ss.get("profiles").and_then(|v| v.as_array()) {
            for p in ep {
                let id = p.get("id").and_then(|x| x.as_str()).unwrap_or("");
                if id.is_empty() || existing_profile_ids.contains(id) {
                    continue;
                }
                profiles.push(p.clone());
            }
        }
    }

    if profiles.is_empty() {
        return store;
    }

    set_path(
        &mut store,
        &["savedSessions"],
        json!({ "folders": folders, "profiles": profiles }),
    );

    for key in ["ai", "terminalPrefs", "locale"] {
        let cur = get_path(&store, &[key]);
        let empty = match key {
            "locale" => cur.as_str().map(|s| s.is_empty()).unwrap_or(true),
            "ai" => {
                let has_key = cur
                    .get("apiKey")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false)
                    || cur
                        .get("providers")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter().any(|p| {
                                p.get("apiKey")
                                    .and_then(|v| v.as_str())
                                    .map(|s| !s.is_empty())
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false);
                !has_key
            }
            _ => cur.as_object().map(|o| o.is_empty()).unwrap_or(true),
        };
        if empty {
            if let Some(v) = electron.get(key) {
                let v = if key == "ai" {
                    crate::secret_crypto::decrypt_ai_settings(v.clone())
                } else {
                    v.clone()
                };
                set_path(&mut store, &[key], v);
            }
        }
    }

    if let Some(sn) = electron.get("snippets").and_then(|v| v.as_array()) {
        let mut cur = get_path(&store, &["snippets"])
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
        }
        set_path(&mut store, &["snippets"], Value::Array(cur));
    }

    for key in [
        "recentConnections",
        "aiChatHistory",
        "aiChatArchive",
        "commandHistory",
    ] {
        let cur = get_path(&store, &[key]);
        let empty = match key {
            "aiChatHistory" => cur.as_object().map(|o| o.is_empty()).unwrap_or(true),
            _ => cur.as_array().map(|a| a.is_empty()).unwrap_or(true),
        };
        if empty {
            if let Some(v) = electron.get(key) {
                set_path(&mut store, &[key], v.clone());
            }
        }
    }

    set_path(
        &mut store,
        &["_importedFromElectronAt"],
        json!(chrono::Utc::now().to_rfc3339()),
    );
    set_path(
        &mut store,
        &["_importedFromElectronSource"],
        json!(electron_path.to_string_lossy()),
    );

    let _ = save_store(&store);
    eprintln!(
        "[ai-ssh-pro] auto-imported {} profiles from Electron store {}",
        store
            .get("savedSessions")
            .and_then(|s| s.get("profiles"))
            .and_then(|p| p.as_array())
            .map(|a| a.len())
            .unwrap_or(0),
        electron_path.display()
    );
    store
}

pub fn load_store() -> Value {
    let path = store_path();
    let base = match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| default_store()),
        Err(_) => default_store(),
    };
    maybe_auto_import_from_electron(base)
}

pub fn save_store(v: &Value) -> Result<(), String> {
    let path = store_path();
    let pretty = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    fs::write(path, pretty).map_err(|e| e.to_string())
}

pub fn default_store() -> Value {
    json!({
        "savedSessions": { "folders": [], "profiles": [] },
        "ai": {
            "providers": [{
                "id": "dashscope",
                "name": "DashScope (OpenAI-compatible)",
                "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "apiKey": "",
                "modelList": ["qwen-max", "qwen-turbo", "qwen-plus"]
            }],
            "activeProviderId": "dashscope",
            "model": "qwen-max",
            "temperature": 0.1,
            "sshParseInstructions": "",
            "useOpenClaw": true
        },
        "terminalPrefs": {
            "themeId": "github-dark",
            "fontSize": 14,
            "fontFamily": "Cascadia Mono, Consolas, monospace",
            "scrollback": 5000,
            "osc52Clipboard": true,
            "muteBell": false,
            "copyOnSelect": false
        },
        "snippets": [],
        "aiChatHistory": {},
        "aiChatArchive": [],
        "commandHistory": [],
        "recentConnections": [],
        "locale": "zh-CN"
    })
}

pub fn get_path(store: &Value, path: &[&str]) -> Value {
    let mut cur = store;
    for p in path {
        match cur.get(*p) {
            Some(v) => cur = v,
            None => return Value::Null,
        }
    }
    cur.clone()
}

pub fn set_path(store: &mut Value, path: &[&str], value: Value) {
    if path.is_empty() {
        *store = value;
        return;
    }
    let mut cur = store;
    for (i, p) in path.iter().enumerate() {
        if i == path.len() - 1 {
            if let Some(obj) = cur.as_object_mut() {
                obj.insert((*p).to_string(), value);
            }
            return;
        }
        if cur.get(*p).is_none() {
            if let Some(obj) = cur.as_object_mut() {
                obj.insert((*p).to_string(), json!({}));
            }
        }
        cur = cur.get_mut(*p).unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_store_sees_imported_profiles() {
        let v = load_store();
        let n = v
            .get("savedSessions")
            .and_then(|s| s.get("profiles"))
            .and_then(|p| p.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        assert!(
            n >= 27,
            "expected >=27 profiles after Electron import, got {n}"
        );
    }
}