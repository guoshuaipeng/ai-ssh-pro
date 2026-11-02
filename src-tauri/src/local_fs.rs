//! Local filesystem helpers for dual-pane SFTP / key pickers (Electron local-fs.ts port).
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

fn to_millis(t: SystemTime) -> i64 {
    t.duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn home() -> String {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

pub fn list(dir: Option<String>) -> Result<Value, String> {
    let path = dir
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from(home()));
    let rd = fs::read_dir(&path).map_err(|e| format!("没有权限：{} ({e})", path.display()))?;
    let mut entries: Vec<Value> = Vec::new();
    for ent in rd.flatten() {
        let name = ent.file_name().to_string_lossy().to_string();
        if name == "." || name == ".." {
            continue;
        }
        let full = ent.path();
        let meta = fs::metadata(&full).ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta
            .as_ref()
            .map(|m| if m.is_dir() { 0 } else { m.len() })
            .unwrap_or(0);
        let mtime = meta
            .and_then(|m| m.modified().ok())
            .map(to_millis)
            .unwrap_or(0);
        entries.push(json!({
            "name": name,
            "path": full.to_string_lossy(),
            "isDirectory": is_dir,
            "size": size,
            "modifyTime": mtime,
        }));
    }
    entries.sort_by(|a, b| {
        let ad = a.get("isDirectory").and_then(|v| v.as_bool()).unwrap_or(false);
        let bd = b.get("isDirectory").and_then(|v| v.as_bool()).unwrap_or(false);
        match (ad, bd) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase()
                .cmp(
                    &b.get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase(),
                ),
        }
    });
    Ok(json!({ "path": path.to_string_lossy(), "entries": entries }))
}

pub fn drives() -> Value {
    #[cfg(windows)]
    {
        let mut drives = Vec::new();
        for code in b'A'..=b'Z' {
            let letter = code as char;
            let root = format!("{letter}:\\");
            let p = Path::new(&root);
            let ready = p.exists();
            if ready || true {
                // include letters that exist; skip totally absent to reduce noise
                if !ready {
                    continue;
                }
                drives.push(json!({
                    "id": format!("{letter}:"),
                    "root": root,
                    "label": format!("{letter}:"),
                    "ready": true,
                }));
            }
        }
        return json!({ "platform": "win32", "drives": drives, "cwd": home() });
    }
    #[cfg(not(windows))]
    {
        json!({
            "platform": "posix",
            "drives": [
                { "id": "/", "root": "/", "label": "/", "ready": true },
                { "id": "~", "root": home(), "label": "~", "ready": true },
            ],
            "cwd": home()
        })
    }
}

pub fn stat(target: String) -> Option<Value> {
    let meta = fs::metadata(&target).ok()?;
    Some(json!({
        "size": meta.len(),
        "mtime": meta.modified().ok().map(to_millis).unwrap_or(0),
        "isDirectory": meta.is_dir(),
    }))
}

pub fn mkdir(target: String) -> Result<bool, String> {
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn rename(from: String, to: String) -> Result<bool, String> {
    fs::rename(&from, &to).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn reveal(target: String) -> bool {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", target))
            .spawn();
        true
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").args(["-R", &target]).spawn();
        true
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = Path::new(&target).parent().unwrap_or(Path::new("/"));
        let _ = std::process::Command::new("xdg-open").arg(parent).spawn();
        true
    }
}

pub fn open_path(target: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &target])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(target)
}

pub fn read_text(target: String, max_bytes: Option<usize>) -> Value {
    let max = max_bytes.unwrap_or(2 * 1024 * 1024);
    match fs::read(&target) {
        Ok(bytes) => {
            let truncated = bytes.len() > max;
            let slice = if truncated { &bytes[..max] } else { &bytes };
            let content = String::from_utf8_lossy(slice).to_string();
            json!({ "ok": true, "content": content, "truncated": truncated })
        }
        Err(e) => json!({ "ok": false, "content": "", "truncated": false, "error": e.to_string() }),
    }
}

pub fn write_text(target: String, content: String) -> Result<bool, String> {
    if let Some(parent) = Path::new(&target).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn write_bytes_b64(target: String, b64: String) -> Result<bool, String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    let bytes = B64.decode(b64.trim()).map_err(|e| e.to_string())?;
    if let Some(parent) = Path::new(&target).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&target, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn list_local_keys() -> Value {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ssh");
    let mut keys = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for ent in rd.flatten() {
            let name = ent.file_name().to_string_lossy().to_string();
            if name.ends_with(".pub") || name == "known_hosts" || name == "config" || name == "authorized_keys" {
                continue;
            }
            let path = ent.path();
            if path.is_file() {
                // skip likely public / non-key names lightly
                if name.starts_with('.') {
                    continue;
                }
                keys.push(json!({
                    "name": name,
                    "path": path.to_string_lossy(),
                }));
            }
        }
    }
    json!({ "dir": dir.to_string_lossy(), "keys": keys })
}

pub fn open_ssh_dir() -> bool {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ssh");
    let _ = fs::create_dir_all(&dir);
    open_path(dir.to_string_lossy().to_string()).is_ok()
}

use std::collections::HashMap;
use std::sync::Mutex;
use uuid::Uuid;

struct TrashEntry {
    original: String,
    staged: String,
}

fn trash_book() -> &'static Mutex<HashMap<String, TrashEntry>> {
    use std::sync::OnceLock;
    static BOOK: OnceLock<Mutex<HashMap<String, TrashEntry>>> = OnceLock::new();
    BOOK.get_or_init(|| Mutex::new(HashMap::new()))
}

fn trash_dir() -> PathBuf {
    let dir = crate::store::data_dir().join("sftp-trash");
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Stage a local path for undo; falls back to permanent delete if rename fails.
pub fn trash(target: String) -> Result<Value, String> {
    let target = target.trim().to_string();
    if target.is_empty() {
        return Err("empty-path".into());
    }
    let src = PathBuf::from(&target);
    if !src.exists() {
        return Err("not-found".into());
    }
    let token = Uuid::new_v4().to_string();
    let name = src
        .file_name()
        .map(|x| x.to_string_lossy().to_string())
        .unwrap_or_else(|| "item".into());
    let staged = trash_dir().join(format!("{token}-{name}"));
    fs::rename(&src, &staged).map_err(|e| e.to_string())?;
    if let Ok(mut book) = trash_book().lock() {
        book.insert(
            token.clone(),
            TrashEntry {
                original: target,
                staged: staged.to_string_lossy().to_string(),
            },
        );
    }
    Ok(json!({ "token": token }))
}

pub fn restore(token: String) -> bool {
    let token = token.trim().to_string();
    if token.is_empty() {
        return false;
    }
    let entry = {
        let Ok(mut book) = trash_book().lock() else {
            return false;
        };
        book.remove(&token)
    };
    let Some(entry) = entry else {
        return false;
    };
    let staged = PathBuf::from(&entry.staged);
    let original = PathBuf::from(&entry.original);
    if !staged.exists() {
        return false;
    }
    if let Some(parent) = original.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::rename(&staged, &original).is_ok()
}
