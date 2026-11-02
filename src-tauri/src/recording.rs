//! Session recording (asciicast v2) + recordings library.
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::store;

struct ActiveRecording {
    #[allow(dead_code)]
    file_path: PathBuf,
    file: File,
    started: Instant,
    #[allow(dead_code)]
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

static GLOBAL: OnceLock<SharedRecordings> = OnceLock::new();

pub fn set_global(reg: SharedRecordings) {
    let _ = GLOBAL.set(reg);
}

#[allow(dead_code)]
pub fn global() -> Option<SharedRecordings> {
    GLOBAL.get().cloned()
}

pub fn append_global(session_id: &str, chunk: &str) {
    if let Some(r) = GLOBAL.get() {
        r.append(session_id, chunk);
    }
}


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
