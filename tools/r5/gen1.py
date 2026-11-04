from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

(ROOT / "src-tauri/src/sync.rs").write_text(r'''//! Cloud sync skeleton: Gist / WebDAV with encrypted vault (Electron-compatible).
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
        "note": "需自行配置 Gist token 或 WebDAV；密钥仅存本机 sync-config.json"
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
    let _ = save_config(&prev);
    public_config(Some(&prev))
}
''', encoding='utf-8')
print('sync.rs', (ROOT/'src-tauri/src/sync.rs').stat().st_size)

(ROOT / "src-tauri/src/updater.rs").write_text(r'''//! Update *check* against public manifests (site / GitHub). In-app install remains gated on
//! code-signing + tauri-plugin-updater endpoints — see MIGRATION-TAURI.md.
use serde_json::{json, Value};

const SITE_LATEST: &str = "https://guoshuaipeng.github.io/ai-ssh-pro/latest.json";
const GITHUB_LATEST: &str =
    "https://api.github.com/repos/guoshuaipeng/ai-ssh-pro/releases/latest";
const GITHUB_RELEASES: &str = "https://github.com/guoshuaipeng/ai-ssh-pro/releases";

fn parse_semver(s: &str) -> Option<(u64, u64, u64)> {
    let t = s.trim().trim_start_matches('v');
    let mut parts = t.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().unwrap_or(0);
    let patch = parts
        .next()
        .unwrap_or("0")
        .split(|c: char| !c.is_ascii_digit())
        .next()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);
    Some((major, minor, patch))
}

fn cmp_semver(a: &str, b: &str) -> i32 {
    match (parse_semver(a), parse_semver(b)) {
        (Some(x), Some(y)) => {
            if x < y {
                -1
            } else if x > y {
                1
            } else {
                0
            }
        }
        _ => 0,
    }
}

async fn fetch_json(url: &str) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("ai-ssh-pro")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

fn from_site(v: &Value, current: &str) -> Option<Value> {
    let latest = v
        .get("version")
        .or_else(|| v.get("latestVersion"))
        .and_then(|x| x.as_str())?;
    let has = cmp_semver(current, latest) < 0;
    Some(json!({
        "currentVersion": current,
        "status": if has { "available" } else { "up-to-date" },
        "latestVersion": latest,
        "releaseUrl": v.get("releaseUrl").cloned().unwrap_or(json!(GITHUB_RELEASES)),
        "downloadUrl": v.get("downloadUrl").or_else(|| v.get("url")).cloned(),
        "releaseName": v.get("name").cloned(),
        "notes": v.get("notes").or_else(|| v.get("body")).cloned(),
        "message": if has { "update-available" } else { "up-to-date" },
        "source": "site",
        "channel": "auto",
        "installDeferred": true,
        "installReason": "自动安装需代码签名与 tauri-plugin-updater 发布端点；当前仅检查并给出下载链接",
        "hasUpdate": has,
        "ok": true,
    }))
}

fn from_github(v: &Value, current: &str) -> Option<Value> {
    let tag = v.get("tag_name").and_then(|x| x.as_str())?;
    let latest = tag.trim_start_matches('v');
    let has = cmp_semver(current, latest) < 0;
    let download = v
        .get("assets")
        .and_then(|a| a.as_array())
        .and_then(|arr| {
            arr.iter().find_map(|a| {
                let name = a.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if name.ends_with(".exe") || name.ends_with(".msi") {
                    a.get("browser_download_url").cloned()
                } else {
                    None
                }
            })
        });
    Some(json!({
        "currentVersion": current,
        "status": if has { "available" } else { "up-to-date" },
        "latestVersion": latest,
        "releaseUrl": v.get("html_url").cloned().unwrap_or(json!(GITHUB_RELEASES)),
        "downloadUrl": download,
        "releaseName": v.get("name").cloned(),
        "notes": v.get("body").cloned(),
        "message": if has { "update-available" } else { "up-to-date" },
        "source": "github",
        "channel": "github",
        "installDeferred": true,
        "installReason": "自动安装需代码签名与 tauri-plugin-updater 发布端点；当前仅检查并给出下载链接",
        "hasUpdate": has,
        "ok": true,
    }))
}

pub async fn check_update(opts: Option<Value>) -> Value {
    let current = env!("CARGO_PKG_VERSION");
    let channel = opts
        .as_ref()
        .and_then(|o| o.get("channel"))
        .and_then(|v| v.as_str())
        .unwrap_or("auto");
    let custom = opts
        .as_ref()
        .and_then(|o| o.get("customUrl"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    let mut tried = Vec::new();
    if channel == "custom" {
        if let Some(url) = custom {
            tried.push("custom");
            match fetch_json(url).await {
                Ok(v) => {
                    if let Some(r) = from_site(&v, current) {
                        let mut r = r;
                        r.as_object_mut().unwrap().insert("source".into(), json!("custom"));
                        r.as_object_mut().unwrap().insert("channel".into(), json!("custom"));
                        r.as_object_mut().unwrap().insert("tried".into(), json!(tried));
                        return r;
                    }
                }
                Err(e) => {
                    return json!({
                        "ok": false,
                        "currentVersion": current,
                        "status": "error",
                        "message": e,
                        "installDeferred": true,
                        "tried": tried,
                    });
                }
            }
        }
    }

    if channel == "auto" || channel == "github" || channel == "custom" {
        if channel == "auto" {
            tried.push("site");
            if let Ok(v) = fetch_json(SITE_LATEST).await {
                if let Some(mut r) = from_site(&v, current) {
                    r.as_object_mut().unwrap().insert("tried".into(), json!(tried));
                    return r;
                }
            }
        }
        tried.push("github");
        match fetch_json(GITHUB_LATEST).await {
            Ok(v) => {
                if let Some(mut r) = from_github(&v, current) {
                    r.as_object_mut().unwrap().insert("tried".into(), json!(tried));
                    if channel == "auto" {
                        r.as_object_mut().unwrap().insert("fellBack".into(), json!(true));
                    }
                    return r;
                }
            }
            Err(e) => {
                return json!({
                    "ok": false,
                    "currentVersion": current,
                    "status": "error",
                    "message": e,
                    "installDeferred": true,
                    "releaseUrl": GITHUB_RELEASES,
                    "tried": tried,
                });
            }
        }
    }

    json!({
        "ok": false,
        "currentVersion": current,
        "status": "error",
        "message": "no-update-source",
        "installDeferred": true,
        "releaseUrl": GITHUB_RELEASES,
        "tried": tried,
    })
}
''', encoding='utf-8')
print('updater.rs', (ROOT/'src-tauri/src/updater.rs').stat().st_size)
print('part1 ok')