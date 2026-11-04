//! Cloud sync skeleton: Gist / WebDAV with encrypted vault (Electron-compatible).
//! Requires user-configured token/URL; no fake remote.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use crate::backup::{decrypt_backup, encrypt_backup};
use crate::store;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncScope {
    pub connections: Option<bool>,
    pub snippets: Option<bool>,
    pub forwards: Option<bool>,
    pub settings: Option<bool>,
    pub credentials: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
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
}

fn sync_path() -> PathBuf {
    store::data_dir().join("sync-config.json")
}

pub fn load_config() -> Option<SyncConfig> {
    let s = fs::read_to_string(sync_path()).ok()?;
    serde_json::from_str(&s).ok()
}

pub fn save_config(cfg: &SyncConfig) -> Result<(), String> {
    let path = sync_path();
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    fs::write(
        path,
        serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

pub fn public_config(cfg: Option<&SyncConfig>) -> Value {
    let Some(c) = cfg else {
        return Value::Null;
    };
    json!({
        "provider": c.provider.clone().unwrap_or_else(|| "gist".into()),
        "gistId": c.gist_id,
        "webdavUrl": c.webdav_url,
        "username": c.username,
        "hasToken": c.token.as_ref().map(|t| !t.is_empty()).unwrap_or(false),
        "hasPassword": c.password.as_ref().map(|t| !t.is_empty()).unwrap_or(false),
        "hasPassphrase": c.sync_passphrase.as_ref().map(|t| !t.is_empty()).unwrap_or(false),
        "scope": c.scope,
        "enabled": true,
        "autoSyncMinutes": c.auto_sync_minutes.unwrap_or(0),
        "autoSyncEnabled": c.auto_sync_enabled.unwrap_or(false),
        "note": "需自行配置 Gist token 或 WebDAV；密钥仅存本机 sync-config.json；定时同步仅为本地调度骨架"
    })
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("ai-ssh-pro")
        .build()
        .map_err(|e| e.to_string())
}

async fn test_github_token(token: &str) -> Value {
    let Ok(client) = client() else {
        return json!({ "ok": false, "message": "http-client" });
    };
    match client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            let login = res
                .json::<Value>()
                .await
                .ok()
                .and_then(|v| v.get("login").and_then(|x| x.as_str()).map(|s| s.to_string()))
                .unwrap_or_else(|| "github".into());
            json!({ "ok": true, "message": login })
        }
        Ok(res) => json!({ "ok": false, "message": format!("HTTP {}", res.status()) }),
        Err(e) => json!({ "ok": false, "message": e.to_string() }),
    }
}

fn webdav_file_url(base: &str) -> String {
    format!("{}/ai-ssh-pro-vault.json", base.trim_end_matches('/'))
}

fn basic_auth(user: &str, pass: &str) -> String {
    format!("Basic {}", B64.encode(format!("{user}:{pass}")))
}

async fn test_webdav(url: &str, user: &str, pass: &str) -> Value {
    let Ok(client) = client() else {
        return json!({ "ok": false, "message": "http-client" });
    };
    match client
        .request(
            reqwest::Method::from_bytes(b"PROPFIND").unwrap_or(reqwest::Method::GET),
            url,
        )
        .header("Authorization", basic_auth(user, pass))
        .header("Depth", "0")
        .send()
        .await
    {
        Ok(res) => {
            let s = res.status().as_u16();
            if s == 401 || s == 403 {
                return json!({ "ok": false, "message": format!("HTTP {s} auth") });
            }
            if res.status().is_success() || s == 207 || s == 404 {
                json!({ "ok": true, "message": "ok" })
            } else {
                json!({ "ok": false, "message": format!("HTTP {s}") })
            }
        }
        Err(e) => json!({ "ok": false, "message": e.to_string() }),
    }
}

pub async fn test_sync() -> Value {
    let Some(cfg) = load_config() else {
        return json!({ "ok": false, "message": "not-configured" });
    };
    let provider = cfg.provider.as_deref().unwrap_or("gist");
    if provider == "gist" {
        let Some(token) = cfg.token.as_ref().filter(|t| !t.is_empty()) else {
            return json!({ "ok": false, "message": "missing-token" });
        };
        return test_github_token(token).await;
    }
    let (Some(url), Some(user), Some(pass)) = (
        cfg.webdav_url.as_ref().filter(|s| !s.is_empty()),
        cfg.username.as_ref().filter(|s| !s.is_empty()),
        cfg.password.as_ref().filter(|s| !s.is_empty()),
    ) else {
        return json!({ "ok": false, "message": "missing-webdav" });
    };
    test_webdav(url, user, pass).await
}

async fn gist_write(token: &str, gist_id: Option<&str>, content: &str) -> Result<String, String> {
    let client = client()?;
    let body = json!({
        "description": "AI-SSH-Pro encrypted vault",
        "public": false,
        "files": { "ai-ssh-pro-vault.json": { "content": content } }
    });
    let url = match gist_id {
        Some(id) if !id.is_empty() => format!("https://api.github.com/gists/{id}"),
        _ => "https://api.github.com/gists".into(),
    };
    let method = if gist_id.map(|s| !s.is_empty()).unwrap_or(false) {
        reqwest::Method::PATCH
    } else {
        reqwest::Method::POST
    };
    let res = client
        .request(method, &url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    v.get("id")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "gist-no-id".to_string())
}

async fn gist_read(token: &str, gist_id: &str) -> Result<String, String> {
    let client = client()?;
    let res = client
        .get(format!("https://api.github.com/gists/{gist_id}"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    v.pointer("/files/ai-ssh-pro-vault.json/content")
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "vault-missing".to_string())
}

async fn webdav_write(url: &str, user: &str, pass: &str, content: &str) -> Result<(), String> {
    let client = client()?;
    let res = client
        .put(webdav_file_url(url))
        .header("Authorization", basic_auth(user, pass))
        .header("Content-Type", "application/json")
        .body(content.to_string())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let s = res.status().as_u16();
    if res.status().is_success() || s == 201 || s == 204 {
        Ok(())
    } else {
        Err(format!("HTTP {s}"))
    }
}

async fn webdav_read(url: &str, user: &str, pass: &str) -> Result<String, String> {
    let client = client()?;
    let res = client
        .get(webdav_file_url(url))
        .header("Authorization", basic_auth(user, pass))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if res.status().as_u16() == 404 {
        return Ok(String::new());
    }
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

pub async fn push_sync(payload: Value, passphrase: String) -> Value {
    let Some(mut cfg) = load_config() else {
        return json!({ "ok": false, "message": "not-configured" });
    };
    let pass = if !passphrase.is_empty() {
        passphrase
    } else {
        cfg.sync_passphrase.clone().unwrap_or_default()
    };
    let envelope = match encrypt_backup(&payload, &pass) {
        Ok(e) => match serde_json::to_string(&e) {
            Ok(s) => s,
            Err(e) => return json!({ "ok": false, "message": e.to_string() }),
        },
        Err(e) => return json!({ "ok": false, "message": e }),
    };
    let provider = cfg.provider.as_deref().unwrap_or("gist");
    if provider == "gist" {
        let Some(token) = cfg.token.clone().filter(|t| !t.is_empty()) else {
            return json!({ "ok": false, "message": "missing-token" });
        };
        match gist_write(&token, cfg.gist_id.as_deref(), &envelope).await {
            Ok(id) => {
                if cfg.gist_id.as_deref() != Some(id.as_str()) {
                    cfg.gist_id = Some(id.clone());
                    let _ = save_config(&cfg);
                }
                json!({ "ok": true, "id": id })
            }
            Err(e) => json!({ "ok": false, "message": e }),
        }
    } else {
        let (Some(url), Some(user), Some(pw)) = (
            cfg.webdav_url.clone().filter(|s| !s.is_empty()),
            cfg.username.clone().filter(|s| !s.is_empty()),
            cfg.password.clone().filter(|s| !s.is_empty()),
        ) else {
            return json!({ "ok": false, "message": "missing-webdav" });
        };
        match webdav_write(&url, &user, &pw, &envelope).await {
            Ok(()) => json!({ "ok": true, "id": url }),
            Err(e) => json!({ "ok": false, "message": e }),
        }
    }
}

pub async fn pull_sync(passphrase: String) -> Value {
    let Some(cfg) = load_config() else {
        return json!({ "ok": false, "message": "not-configured" });
    };
    let provider = cfg.provider.as_deref().unwrap_or("gist");
    let raw = if provider == "gist" {
        let (Some(token), Some(id)) = (
            cfg.token.as_ref().filter(|t| !t.is_empty()),
            cfg.gist_id.as_ref().filter(|t| !t.is_empty()),
        ) else {
            return json!({ "ok": false, "message": "missing-gist" });
        };
        match gist_read(token, id).await {
            Ok(s) => s,
            Err(e) => return json!({ "ok": false, "message": e }),
        }
    } else {
        let (Some(url), Some(user), Some(pw)) = (
            cfg.webdav_url.as_ref().filter(|s| !s.is_empty()),
            cfg.username.as_ref().filter(|s| !s.is_empty()),
            cfg.password.as_ref().filter(|s| !s.is_empty()),
        ) else {
            return json!({ "ok": false, "message": "missing-webdav" });
        };
        match webdav_read(url, user, pw).await {
            Ok(s) => s,
            Err(e) => return json!({ "ok": false, "message": e }),
        }
    };
    if raw.trim().is_empty() {
        return json!({ "ok": true, "empty": true, "payload": null });
    }
    let pass = if !passphrase.is_empty() {
        passphrase
    } else {
        cfg.sync_passphrase.clone().unwrap_or_default()
    };
    match decrypt_backup(&raw, &pass) {
        Ok(payload) => json!({ "ok": true, "empty": false, "payload": payload }),
        Err(_) => json!({ "ok": false, "message": "decrypt" }),
    }
}

pub fn backup_local(payload: &Value) -> Value {
    let dir = store::data_dir().join("sync-backups");
    let _ = fs::create_dir_all(&dir);
    let file = dir.join(format!("vault-{}.json", chrono::Utc::now().timestamp_millis()));
    match fs::write(&file, serde_json::to_string(payload).unwrap_or_else(|_| "{}".into())) {
        Ok(()) => json!({ "ok": true, "file": file.to_string_lossy() }),
        Err(e) => json!({ "ok": false, "message": e.to_string() }),
    }
}

pub fn set_config(patch: Value) -> Value {
    let mut prev = load_config().unwrap_or_default();
    if let Some(p) = patch.get("provider").and_then(|v| v.as_str()) {
        prev.provider = Some(if p == "webdav" { "webdav" } else { "gist" }.into());
    }
    if let Some(v) = patch.get("gistId") {
        prev.gist_id = v.as_str().map(|s| s.to_string());
    }
    if let Some(v) = patch.get("webdavUrl") {
        prev.webdav_url = v.as_str().map(|s| s.to_string());
    }
    if let Some(v) = patch.get("username") {
        prev.username = v.as_str().map(|s| s.to_string());
    }
    if patch.get("clearToken").and_then(|v| v.as_bool()).unwrap_or(false) {
        prev.token = None;
    } else if let Some(t) = patch.get("token").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        prev.token = Some(t.to_string());
    }
    if patch.get("clearPassword").and_then(|v| v.as_bool()).unwrap_or(false) {
        prev.password = None;
    } else if let Some(t) = patch.get("password").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        prev.password = Some(t.to_string());
    }
    if let Some(t) = patch
        .get("syncPassphrase")
        .or_else(|| patch.get("vaultPass"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        prev.sync_passphrase = Some(t.to_string());
    }
    if let Some(scope) = patch.get("scope") {
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
}
