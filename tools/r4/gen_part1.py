from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

backup = r"""//! Local encrypted backup (Electron-compatible: scrypt + AES-256-GCM).
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use scrypt::{scrypt, Params};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::store;

pub const BACKUP_FORMAT: &str = "ai-ssh-pro-backup";
pub const BACKUP_MIN_PASSWORD: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEnvelope {
    pub format: String,
    pub version: u32,
    pub kdf: BackupKdf,
    pub cipher: String,
    pub iv: String,
    pub tag: String,
    pub data: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupKdf {
    pub name: String,
    #[serde(rename = "N")]
    pub n: u32,
    pub r: u32,
    pub p: u32,
    pub salt: String,
}

fn derive_key_logn(password: &str, salt: &[u8], log_n: u8, r: u32, p: u32) -> Result<[u8; 32], String> {
    let params = Params::new(log_n, r, p, 32).map_err(|e| format!("scrypt params: {e}"))?;
    let mut key = [0u8; 32];
    scrypt(password.as_bytes(), salt, &params, &mut key).map_err(|e| format!("scrypt: {e}"))?;
    Ok(key)
}

fn log2_exact(n: u32) -> Option<u8> {
    if n > 0 && n.is_power_of_two() {
        Some(n.trailing_zeros() as u8)
    } else {
        None
    }
}

pub fn encrypt_backup(payload: &Value, password: &str) -> Result<BackupEnvelope, String> {
    if password.len() < BACKUP_MIN_PASSWORD {
        return Err("password-too-short".into());
    }
    let mut salt = [0u8; 16];
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut iv);
    let log_n: u8 = 15;
    let r = 8u32;
    let p = 1u32;
    let key = derive_key_logn(password, &salt, log_n, r, p)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let plaintext = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&iv);
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: &plaintext,
                aad: BACKUP_FORMAT.as_bytes(),
            },
        )
        .map_err(|_| "encrypt failed".to_string())?;
    if ciphertext.len() < 16 {
        return Err("encrypt failed".into());
    }
    let (data, tag) = ciphertext.split_at(ciphertext.len() - 16);
    Ok(BackupEnvelope {
        format: BACKUP_FORMAT.into(),
        version: 1,
        kdf: BackupKdf {
            name: "scrypt".into(),
            n: 1 << log_n,
            r,
            p,
            salt: B64.encode(salt),
        },
        cipher: "aes-256-gcm".into(),
        iv: B64.encode(iv),
        tag: B64.encode(tag),
        data: B64.encode(data),
        created_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    })
}

pub fn decrypt_backup(raw: &str, password: &str) -> Result<Value, String> {
    let env: BackupEnvelope = serde_json::from_str(raw).map_err(|_| "not-a-backup".to_string())?;
    if env.format != BACKUP_FORMAT
        || env.version != 1
        || env.cipher != "aes-256-gcm"
        || env.kdf.name != "scrypt"
    {
        return Err("not-a-backup".into());
    }
    let n = env.kdf.n;
    let r = env.kdf.r;
    let p = env.kdf.p;
    if n == 0 || n > (1 << 20) || r == 0 || r > 32 || p == 0 || p > 16 {
        return Err("not-a-backup".into());
    }
    let log_n = log2_exact(n).ok_or_else(|| "not-a-backup".to_string())?;
    let salt = B64.decode(&env.kdf.salt).map_err(|_| "not-a-backup".to_string())?;
    let iv = B64.decode(&env.iv).map_err(|_| "not-a-backup".to_string())?;
    let tag = B64.decode(&env.tag).map_err(|_| "not-a-backup".to_string())?;
    let data = B64.decode(&env.data).map_err(|_| "not-a-backup".to_string())?;
    if iv.len() != 12 {
        return Err("not-a-backup".into());
    }
    let key = derive_key_logn(password, &salt, log_n, r, p)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut combined = data;
    combined.extend_from_slice(&tag);
    let nonce = Nonce::from_slice(&iv);
    let plain = cipher
        .decrypt(
            nonce,
            Payload {
                msg: &combined,
                aad: BACKUP_FORMAT.as_bytes(),
            },
        )
        .map_err(|_| "wrong-password".to_string())?;
    serde_json::from_slice(&plain).map_err(|_| "not-a-backup".to_string())
}

fn counts(payload: &Value) -> Value {
    let profiles = payload
        .pointer("/savedSessions/profiles")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let folders = payload
        .pointer("/savedSessions/folders")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let snippets = payload
        .get("snippets")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    json!({ "profiles": profiles, "folders": folders, "snippets": snippets })
}

fn path_from_dialog(fp: tauri_plugin_dialog::FilePath) -> Option<PathBuf> {
    fp.into_path().ok()
}

pub fn export_backup(app: &AppHandle, store: &Value, password: &str, include_ai: bool) -> Value {
    if password.len() < BACKUP_MIN_PASSWORD {
        return json!({ "ok": false, "error": "password-too-short" });
    }
    let picked = app
        .dialog()
        .file()
        .add_filter("AI-SSH-Pro backup", &["aissbak"])
        .set_file_name(format!(
            "ai-ssh-pro-backup-{}.aissbak",
            chrono::Local::now().format("%Y-%m-%d")
        ))
        .blocking_save_file();
    let Some(fp) = picked else {
        return json!({ "ok": false, "canceled": true, "error": "canceled" });
    };
    let Some(path) = path_from_dialog(fp) else {
        return json!({ "ok": false, "error": "invalid-path" });
    };
    let mut payload = json!({
        "app": "ai-ssh-pro",
        "appVersion": env!("CARGO_PKG_VERSION"),
        "savedSessions": store.get("savedSessions").cloned().unwrap_or(json!({ "folders": [], "profiles": [] })),
        "snippets": store.get("snippets").cloned().unwrap_or(json!([])),
        "terminalPrefs": store.get("terminalPrefs").cloned().unwrap_or(json!({})),
    });
    if include_ai {
        if let Some(ai) = store.get("ai") {
            payload.as_object_mut().unwrap().insert("ai".into(), ai.clone());
        }
    }
    match encrypt_backup(&payload, password) {
        Ok(env) => match serde_json::to_string_pretty(&env) {
            Ok(text) => match fs::write(&path, text) {
                Ok(()) => json!({ "ok": true, "path": path.to_string_lossy(), "counts": counts(&payload) }),
                Err(e) => json!({ "ok": false, "error": e.to_string() }),
            },
            Err(e) => json!({ "ok": false, "error": e.to_string() }),
        },
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub fn import_backup(app: &AppHandle, store: &mut Value, password: &str) -> Value {
    let picked = app
        .dialog()
        .file()
        .add_filter("AI-SSH-Pro backup", &["aissbak"])
        .blocking_pick_file();
    let Some(fp) = picked else {
        return json!({ "ok": false, "canceled": true, "error": "canceled" });
    };
    let Some(path) = path_from_dialog(fp) else {
        return json!({ "ok": false, "error": "invalid-path" });
    };
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => return json!({ "ok": false, "error": e.to_string() }),
    };
    let payload = match decrypt_backup(&raw, password) {
        Ok(v) => v,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let app_name = payload.get("app").and_then(|v| v.as_str()).unwrap_or("");
    let sessions = payload.get("savedSessions");
    let profiles_ok = sessions
        .and_then(|s| s.get("profiles"))
        .and_then(|v| v.as_array())
        .is_some();
    let folders_ok = sessions
        .and_then(|s| s.get("folders"))
        .and_then(|v| v.as_array())
        .is_some();
    if app_name != "ai-ssh-pro" || !profiles_ok || !folders_ok {
        return json!({ "ok": false, "error": "not-a-backup" });
    }
    if let Some(s) = sessions {
        store::set_path(store, &["savedSessions"], s.clone());
    }
    if let Some(sn) = payload.get("snippets").filter(|v| v.is_array()) {
        store::set_path(store, &["snippets"], sn.clone());
    }
    if let Some(tp) = payload.get("terminalPrefs").filter(|v| v.is_object()) {
        store::set_path(store, &["terminalPrefs"], tp.clone());
    }
    if let Some(ai) = payload.get("ai").filter(|v| v.is_object()) {
        store::set_path(store, &["ai"], ai.clone());
    }
    if let Err(e) = store::save_store(store) {
        return json!({ "ok": false, "error": e });
    }
    json!({ "ok": true, "counts": counts(&payload) })
}
"""

recording = r"""//! Session recording (asciicast v2) + recordings library.
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::store;

struct ActiveRecording {
    file_path: PathBuf,
    file: File,
    started: Instant,
    started_wall_ms: u128,
}

pub struct RecordingRegistry {
    active: Mutex<HashMap<String, ActiveRecording>>,
}

impl RecordingRegistry {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
        }
    }

    pub fn append(&self, session_id: &str, chunk: &str) {
        if chunk.is_empty() {
            return;
        }
        let mut map = self.active.lock();
        let Some(entry) = map.get_mut(session_id) else {
            return;
        };
        let time = entry.started.elapsed().as_secs_f64();
        let t = (time * 1000.0).round() / 1000.0;
        let line = match serde_json::to_string(&(t, "o", chunk)) {
            Ok(s) => s,
            Err(_) => return,
        };
        let _ = writeln!(entry.file, "{line}");
        let _ = entry.file.flush();
    }

    pub fn stop(&self, session_id: &str) -> bool {
        let mut map = self.active.lock();
        if let Some(mut entry) = map.remove(session_id) {
            let _ = entry.file.flush();
            true
        } else {
            false
        }
    }

    pub fn stop_all(&self) {
        let ids: Vec<String> = self.active.lock().keys().cloned().collect();
        for id in ids {
            self.stop(&id);
        }
    }

    pub fn start(
        &self,
        session_id: &str,
        file_path: PathBuf,
        cols: u32,
        rows: u32,
        title: Option<&str>,
    ) -> Result<String, String> {
        let id = session_id.trim();
        if id.is_empty() {
            return Err("sessionId required".into());
        }
        self.stop(id);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&file_path)
            .map_err(|e| e.to_string())?;
        let started_wall_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let mut header = json!({
            "version": 2,
            "width": if cols > 0 { cols } else { 120 },
            "height": if rows > 0 { rows } else { 32 },
            "timestamp": (started_wall_ms / 1000) as u64,
        });
        if let Some(t) = title.filter(|s| !s.is_empty()) {
            header.as_object_mut().unwrap().insert("title".into(), json!(t));
        }
        writeln!(file, "{}", serde_json::to_string(&header).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        let path_str = file_path.to_string_lossy().to_string();
        self.active.lock().insert(
            id.to_string(),
            ActiveRecording {
                file_path,
                file,
                started: Instant::now(),
                started_wall_ms,
            },
        );
        let _ = started_wall_ms;
        Ok(path_str)
    }
}

pub type SharedRecordings = Arc<RecordingRegistry>;

fn recordings_root() -> PathBuf {
    store::data_dir().join("recordings")
}

fn safe_recording(file: &str) -> Result<PathBuf, String> {
    let root = recordings_root()
        .canonicalize()
        .unwrap_or_else(|_| recordings_root());
    let abs = PathBuf::from(file);
    let abs = abs.canonicalize().unwrap_or(abs);
    if !abs.starts_with(&root) {
        return Err("path".into());
    }
    Ok(abs)
}

pub fn list_recordings() -> Value {
    let root = recordings_root();
    if !root.exists() {
        return json!([]);
    }
    let mut out = Vec::new();
    let Ok(hosts) = fs::read_dir(&root) else {
        return json!([]);
    };
    for host_ent in hosts.flatten() {
        let host_path = host_ent.path();
        if !host_path.is_dir() {
            continue;
        }
        let host = host_ent.file_name().to_string_lossy().to_string();
        let Ok(files) = fs::read_dir(&host_path) else {
            continue;
        };
        for f in files.flatten() {
            let p = f.path();
            if p.extension().and_then(|e| e.to_str()) != Some("cast") {
                continue;
            }
            let meta = f.metadata().ok();
            let bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let mtime = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            out.push(json!({
                "file": p.to_string_lossy(),
                "host": host,
                "bytes": bytes,
                "mtime": mtime,
            }));
        }
    }
    out.sort_by(|a, b| {
        let am = a.get("mtime").and_then(|v| v.as_u64()).unwrap_or(0);
        let bm = b.get("mtime").and_then(|v| v.as_u64()).unwrap_or(0);
        bm.cmp(&am)
    });
    json!(out)
}

pub fn read_recording(file: &str) -> Result<String, String> {
    let path = safe_recording(file)?;
    fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn delete_recording(file: &str) -> Result<bool, String> {
    let path = safe_recording(file)?;
    fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn start_recording_cmd(
    app: &AppHandle,
    registry: &RecordingRegistry,
    session_id: &str,
    opts: Option<&Value>,
) -> Result<Option<String>, String> {
    let auto = opts
        .and_then(|o| o.get("auto"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let cols = opts
        .and_then(|o| o.get("cols"))
        .and_then(|v| v.as_u64())
        .unwrap_or(120) as u32;
    let rows = opts
        .and_then(|o| o.get("rows"))
        .and_then(|v| v.as_u64())
        .unwrap_or(32) as u32;
    let title = opts
        .and_then(|o| o.get("title"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let path = if auto {
        let host = opts
            .and_then(|o| o.get("host"))
            .and_then(|v| v.as_str())
            .unwrap_or("host");
        let safe_host: String = host
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
            .take(80)
            .collect();
        let host_dir = if safe_host.is_empty() {
            "host".to_string()
        } else {
            safe_host
        };
        let dir = recordings_root().join(&host_dir);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let name = format!(
            "session-{}.cast",
            chrono::Local::now().format("%Y%m%d-%H%M%S")
        );
        dir.join(name)
    } else {
        let picked = app
            .dialog()
            .file()
            .add_filter("asciicast", &["cast"])
            .set_file_name(format!("session-{}.cast", &session_id[..session_id.len().min(8)]))
            .blocking_save_file();
        let Some(fp) = picked else {
            return Ok(None);
        };
        fp.into_path().map_err(|e| e.to_string())?
    };
    let p = registry.start(
        session_id,
        path,
        cols,
        rows,
        title.as_deref(),
    )?;
    Ok(Some(p))
}

#[allow(dead_code)]
fn _path_exists(p: &Path) -> bool {
    p.exists()
}
"""

(ROOT / "src-tauri/src/backup.rs").write_text(backup, encoding="utf-8")
(ROOT / "src-tauri/src/recording.rs").write_text(recording, encoding="utf-8")
print("wrote backup+recording", (ROOT/"src-tauri/src/backup.rs").stat().st_size, (ROOT/"src-tauri/src/recording.rs").stat().st_size)