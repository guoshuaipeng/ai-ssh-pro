//! Native dialogs for SFTP picks + OpenSSH known_hosts import preview + SFTP queue store.
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::known_hosts::{self, KnownHostsStore};
use crate::store;

fn path_str(fp: tauri_plugin_dialog::FilePath) -> Option<String> {
    fp.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

pub fn sftp_pick_download_path(app: &AppHandle, default_name: Option<String>) -> Option<String> {
    let name = default_name.unwrap_or_else(|| "download.bin".into());
    app.dialog()
        .file()
        .set_file_name(name)
        .blocking_save_file()
        .and_then(path_str)
}

pub fn sftp_pick_upload_files(app: &AppHandle) -> Option<Vec<String>> {
    app.dialog()
        .file()
        .blocking_pick_files()
        .map(|list| {
            list.into_iter()
                .filter_map(path_str)
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty())
}

pub fn sftp_pick_save_paths(app: &AppHandle, names: Vec<String>) -> Option<Vec<String>> {
    let dir = app.dialog().file().blocking_pick_folder().and_then(path_str)?;
    let dir_path = PathBuf::from(&dir);
    Some(
        names
            .into_iter()
            .map(|n| {
                let safe = n
                    .chars()
                    .map(|c| match c {
                        '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
                        _ => c,
                    })
                    .collect::<String>();
                let name = if safe.trim().is_empty() {
                    "file".to_string()
                } else {
                    safe
                };
                dir_path.join(name).to_string_lossy().to_string()
            })
            .collect(),
    )
}

pub fn known_hosts_pick_import(app: &AppHandle, known: &KnownHostsStore) -> Option<Value> {
    let default = dirs::home_dir()
        .map(|h| h.join(".ssh").join("known_hosts"))
        .unwrap_or_else(|| PathBuf::from("known_hosts"));
    let picked = app
        .dialog()
        .file()
        .set_file_name(
            default
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("known_hosts")
                .to_string(),
        )
        .blocking_pick_file()?;
    let path = picked.into_path().ok()?;
    let text = fs::read_to_string(&path).ok()?;
    Some(known_hosts::build_import_preview(&text, Some(path.to_string_lossy().to_string()), known))
}

fn queue_path() -> PathBuf {
    store::data_dir().join("sftp-queue.json")
}

pub fn sftp_queue_load() -> Value {
    match fs::read_to_string(queue_path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| json!([])),
        Err(_) => json!([]),
    }
}

pub fn sftp_queue_save(tasks: Value) -> Value {
    let next = if tasks.is_array() { tasks } else { json!([]) };
    let path = queue_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&path, serde_json::to_string(&next).unwrap_or_else(|_| "[]".into()));
    next
}

#[allow(dead_code)]
fn _is_file(p: &Path) -> bool {
    p.is_file()
}


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
