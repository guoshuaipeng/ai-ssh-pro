//! Remote file content snapshots (Electron shared/snapshots + snapshot-ipc).
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::store;

const MAGIC: &str = "aiss-snap-v1";
const MAX_BYTES: usize = 2 * 1024 * 1024;
const DEFAULT_KEEP: usize = 10;
const KEEP_OPTIONS: [usize; 4] = [5, 10, 20, 50];
const GLOBAL_CAP: u64 = 200 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub profile_id: String,
    pub path: String,
    pub at: u64,
    pub source: String,
    pub bytes: u64,
    pub pinned: bool,
    pub hash: String,
    pub ciphertext: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stale: Option<bool>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn root() -> PathBuf {
    store::data_dir().join("snapshots")
}

fn index_path() -> PathBuf {
    root().join("index.json")
}

fn prefs_path() -> PathBuf {
    root().join("prefs.json")
}

fn key_path() -> PathBuf {
    root().join("snapshot.key")
}

fn ensure_key() -> Result<[u8; 32], String> {
    let p = key_path();
    let _ = fs::create_dir_all(root());
    if p.is_file() {
        let raw = fs::read(&p).map_err(|e| e.to_string())?;
        if raw.len() == 32 {
            let mut k = [0u8; 32];
            k.copy_from_slice(&raw);
            return Ok(k);
        }
    }
    let mut k = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut k);
    fs::write(&p, k).map_err(|e| e.to_string())?;
    Ok(k)
}

fn encrypt_secret(plain: &str) -> Result<String, String> {
    let key = ensure_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plain.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut blob = Vec::with_capacity(12 + ct.len());
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ct);
    Ok(format!("{MAGIC}:{}", B64.encode(blob)))
}

fn decrypt_secret(envelope: &str) -> Result<String, String> {
    let rest = envelope
        .strip_prefix(&format!("{MAGIC}:"))
        .ok_or_else(|| "decrypt".to_string())?;
    let blob = B64.decode(rest.trim()).map_err(|_| "decrypt".to_string())?;
    if blob.len() < 13 {
        return Err("decrypt".into());
    }
    let key = ensure_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&blob[..12]);
    let pt = cipher
        .decrypt(nonce, &blob[12..])
        .map_err(|_| "decrypt".to_string())?;
    String::from_utf8(pt).map_err(|_| "decrypt".to_string())
}

fn normalize_path(path: &str) -> String {
    let s = path.replace('\\', "/");
    let mut out = String::new();
    for part in s.split('/') {
        if part.is_empty() {
            continue;
        }
        out.push('/');
        out.push_str(part);
    }
    if out.is_empty() {
        "/".into()
    } else {
        out
    }
}

fn hash_text(text: &str) -> String {
    let mut h: u32 = 5381;
    for b in text.bytes() {
        h = h.wrapping_shl(5).wrapping_add(h) ^ (b as u32);
    }
    format!("{h:x}")
}

fn load_list() -> Vec<Snapshot> {
    let _ = fs::create_dir_all(root());
    fs::read_to_string(index_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_list(list: &[Snapshot]) {
    let _ = fs::create_dir_all(root());
    let _ = fs::write(
        index_path(),
        serde_json::to_string(list).unwrap_or_else(|_| "[]".into()),
    );
}

fn read_prefs() -> (bool, usize) {
    let raw = fs::read_to_string(prefs_path()).ok();
    if let Some(s) = raw {
        if let Ok(v) = serde_json::from_str::<Value>(&s) {
            let auto = v.get("auto").and_then(|x| x.as_bool()).unwrap_or(true);
            let keep = v
                .get("keep")
                .and_then(|x| x.as_u64())
                .map(|n| n as usize)
                .unwrap_or(DEFAULT_KEEP);
            let keep = if KEEP_OPTIONS.contains(&keep) {
                keep
            } else {
                DEFAULT_KEEP
            };
            return (auto, keep);
        }
    }
    (true, DEFAULT_KEEP)
}

fn write_prefs(auto: bool, keep: usize) -> Value {
    let keep = if KEEP_OPTIONS.contains(&keep) {
        keep
    } else {
        DEFAULT_KEEP
    };
    let _ = fs::create_dir_all(root());
    let v = json!({ "auto": auto, "keep": keep });
    let _ = fs::write(prefs_path(), v.to_string());
    v
}

fn public_row(s: &Snapshot) -> Value {
    json!({
        "id": s.id,
        "profileId": s.profile_id,
        "path": s.path,
        "at": s.at,
        "source": s.source,
        "bytes": s.bytes,
        "pinned": s.pinned,
        "hash": s.hash,
        "stale": s.stale,
    })
}

fn should_record(source: &str, auto: bool) -> bool {
    source == "rollback" || auto
}

fn trim_snapshots(list: Vec<Snapshot>, keep: usize) -> Vec<Snapshot> {
    let mut by_file: HashMap<String, Vec<Snapshot>> = HashMap::new();
    for s in list {
        let key = format!("{}\0{}", s.profile_id, s.path);
        by_file.entry(key).or_default().push(s);
    }
    let mut out = Vec::new();
    for mut group in by_file.into_values() {
        group.sort_by(|a, b| b.at.cmp(&a.at));
        let mut kept = 0usize;
        for s in group {
            if s.pinned || kept < keep {
                if !s.pinned {
                    kept += 1;
                }
                out.push(s);
            }
        }
    }
    // global byte cap: drop oldest unpinned
    let mut total: u64 = out.iter().map(|s| s.bytes).sum();
    if total > GLOBAL_CAP {
        out.sort_by(|a, b| a.at.cmp(&b.at));
        let mut drop_ids = HashSet::new();
        for s in &out {
            if total <= GLOBAL_CAP {
                break;
            }
            if s.pinned {
                continue;
            }
            drop_ids.insert(s.id.clone());
            total = total.saturating_sub(s.bytes);
        }
        out.retain(|s| !drop_ids.contains(&s.id));
    }
    out.sort_by(|a, b| b.at.cmp(&a.at));
    out
}

pub fn list_snapshots(query: Option<Value>) -> Value {
    let profile = query
        .as_ref()
        .and_then(|q| q.get("profileId"))
        .and_then(|x| x.as_str())
        .unwrap_or("");
    let path = query
        .as_ref()
        .and_then(|q| q.get("path"))
        .and_then(|x| x.as_str())
        .map(normalize_path);
    let list = load_list();
    let rows: Vec<Value> = list
        .iter()
        .filter(|s| profile.is_empty() || s.profile_id == profile)
        .filter(|s| path.as_ref().map(|p| &s.path == p).unwrap_or(true))
        .map(public_row)
        .collect();
    json!(rows)
}

pub fn stats() -> Value {
    let list = load_list();
    let files: HashSet<String> = list
        .iter()
        .map(|s| format!("{}\0{}", s.profile_id, s.path))
        .collect();
    let bytes: u64 = list.iter().map(|s| s.bytes).sum();
    json!({ "files": files.len(), "bytes": bytes, "count": list.len() })
}

pub fn put(input: Value) -> Result<Value, String> {
    let profile_id = input
        .get("profileId")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if profile_id.is_empty() {
        return Err("profileId required".into());
    }
    let path = normalize_path(input.get("path").and_then(|x| x.as_str()).unwrap_or("/"));
    let content = input
        .get("content")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let source = input
        .get("source")
        .and_then(|x| x.as_str())
        .unwrap_or("edit")
        .to_string();
    let is_text = input
        .get("isText")
        .and_then(|x| x.as_bool())
        .unwrap_or(true);
    let stale = input.get("stale").and_then(|x| x.as_bool());
    let (prefs_auto, prefs_keep) = read_prefs();
    let auto = input
        .get("auto")
        .and_then(|x| x.as_bool())
        .unwrap_or(prefs_auto);
    let keep = input
        .get("keep")
        .and_then(|x| x.as_u64())
        .map(|n| n as usize)
        .filter(|n| KEEP_OPTIONS.contains(n))
        .unwrap_or(prefs_keep);
    if input.get("auto").is_some() || input.get("keep").is_some() {
        write_prefs(auto, keep);
    }
    let current = load_list();
    let count_of = |list: &[Snapshot]| {
        list.iter()
            .filter(|s| s.profile_id == profile_id && s.path == path)
            .count()
    };
    if !should_record(&source, auto) {
        return Ok(json!({ "added": false, "skipped": "disabled", "count": count_of(&current) }));
    }
    if content.is_empty() && source != "syncDelete" {
        return Ok(json!({ "added": false, "skipped": "empty", "count": count_of(&current) }));
    }
    if !is_text || content.contains('\0') {
        return Ok(json!({ "added": false, "skipped": "binary", "count": count_of(&current) }));
    }
    if content.len() > MAX_BYTES {
        return Ok(json!({ "added": false, "skipped": "size", "count": count_of(&current) }));
    }
    let hash = hash_text(&content);
    let mut list = current;
    if let Some(newest) = list
        .iter()
        .filter(|s| s.profile_id == profile_id && s.path == path)
        .max_by_key(|s| s.at)
    {
        if newest.hash == hash {
            let id = newest.id.clone();
            let at = now_ms();
            for s in &mut list {
                if s.id == id {
                    s.at = at;
                }
            }
            save_list(&list);
            return Ok(json!({ "added": false, "skipped": "duplicate", "count": count_of(&list) }));
        }
    }
    let ciphertext = encrypt_secret(&content)?;
    let row = Snapshot {
        id: format!("snap-{}-{:x}", now_ms(), rand::random::<u32>()),
        profile_id: profile_id.clone(),
        path: path.clone(),
        at: now_ms(),
        source,
        bytes: content.len() as u64,
        pinned: false,
        hash,
        ciphertext,
        stale,
    };
    let id = row.id.clone();
    list.insert(0, row);
    list = trim_snapshots(list, keep);
    let added = list.iter().any(|s| s.id == id);
    save_list(&list);
    Ok(json!({
        "added": added,
        "skipped": if added { Value::Null } else { json!("trimmed") },
        "count": count_of(&list)
    }))
}

pub fn set_prefs(input: Option<Value>) -> Value {
    let (auto0, keep0) = read_prefs();
    let auto = input
        .as_ref()
        .and_then(|v| v.get("auto"))
        .and_then(|x| x.as_bool())
        .unwrap_or(auto0);
    let keep = input
        .as_ref()
        .and_then(|v| v.get("keep"))
        .and_then(|x| x.as_u64())
        .map(|n| n as usize)
        .filter(|n| KEEP_OPTIONS.contains(n))
        .unwrap_or(keep0);
    write_prefs(auto, keep)
}

pub fn read_one(id: &str) -> Value {
    let list = load_list();
    let Some(row) = list.iter().find(|s| s.id == id) else {
        return json!({ "ok": false, "reason": "missing" });
    };
    match decrypt_secret(&row.ciphertext) {
        Ok(content) => json!({ "ok": true, "content": content, "snapshot": public_row(row) }),
        Err(_) => json!({ "ok": false, "reason": "decrypt" }),
    }
}

pub fn pin(id: &str, pinned: bool) -> Value {
    let mut list = load_list();
    for s in &mut list {
        if s.id == id {
            s.pinned = pinned;
        }
    }
    save_list(&list);
    list.iter()
        .find(|s| s.id == id)
        .map(public_row)
        .unwrap_or(Value::Null)
}

pub fn delete_one(id: &str) -> Value {
    let mut list = load_list();
    list.retain(|s| s.id != id);
    save_list(&list);
    json!({ "ok": true })
}

pub fn clear_all() -> Value {
    let n = load_list().len();
    save_list(&[]);
    json!({ "ok": true, "n": n })
}

pub fn open_dir() -> Value {
    let dir = root();
    let _ = fs::create_dir_all(&dir);
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&dir).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    json!({ "ok": true })
}

pub fn rollback_allowed(level: &str) -> bool {
    level != "readonly"
}
