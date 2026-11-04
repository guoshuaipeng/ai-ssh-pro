from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

dialogs = r"""//! Native dialogs for SFTP picks + OpenSSH known_hosts import preview + SFTP queue store.
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
"""

(ROOT / "src-tauri/src/dialogs.rs").write_text(dialogs, encoding="utf-8")
print("dialogs", (ROOT/"src-tauri/src/dialogs.rs").stat().st_size)

# Append OpenSSH import helpers to known_hosts.rs
kh = (ROOT / "src-tauri/src/known_hosts.rs").read_text(encoding="utf-8")
if "build_import_preview" not in kh:
    kh += r'''

/// Parse plain (non-hashed) OpenSSH known_hosts text into import preview rows.
pub fn build_import_preview(text: &str, source_path: Option<String>, store: &KnownHostsStore) -> Value {
    use serde_json::json;
    let existing = store.list();
    let mut rows = Vec::new();
    let mut skipped_hashed = 0usize;
    let mut skipped_other = 0usize;
    let mut hashed_samples: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for raw_line in text.split('\n') {
        let line = raw_line.trim();
        if line.is_empty() {
            skipped_other += 1;
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        if line.starts_with('@') {
            skipped_other += 1;
            continue;
        }
        let bits: Vec<&str> = line.split_whitespace().collect();
        if bits.len() < 3 {
            skipped_other += 1;
            continue;
        }
        let names_field = bits[0];
        let key_type = bits[1];
        let host_key_b64 = bits[2];
        if names_field.starts_with('|')
            || names_field.split(',').any(|p| p.trim().starts_with('|'))
        {
            skipped_hashed += 1;
            if hashed_samples.len() < 8 {
                let sample = if line.chars().count() > 96 {
                    format!("{}…", line.chars().take(96).collect::<String>())
                } else {
                    line.to_string()
                };
                hashed_samples.push(sample);
            }
            continue;
        }
        if !host_key_b64
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
            || host_key_b64.len() < 32
        {
            skipped_other += 1;
            continue;
        }
        for name_token in names_field.split(',') {
            let token = name_token.trim();
            if token.is_empty() {
                continue;
            }
            let (host, port) = parse_known_host_name(token);
            let dedupe = format!("{host}:{port}|{key_type}|{host_key_b64}");
            if !seen.insert(dedupe) {
                continue;
            }
            let host_port = format!("{}:{}", host.to_lowercase(), port);
            let existing_entry = existing.iter().find(|e| e.host_port == host_port);
            let action = match existing_entry {
                None => "add",
                Some(e) if e.host_key_base64 == host_key_b64 => "skip",
                Some(_) => "update",
            };
            let fingerprint = match B64.decode(host_key_b64) {
                Ok(bytes) => KnownHostsStore::fingerprint_sha256(&bytes),
                Err(_) => "SHA256:?".into(),
            };
            rows.push(json!({
                "host": host,
                "port": port,
                "keyType": key_type,
                "hostKeyBase64": host_key_b64,
                "action": action,
                "fingerprint": fingerprint,
                "selectedDefault": action == "add" || action == "update",
            }));
        }
    }

    json!({
        "rows": rows,
        "skippedHashed": skipped_hashed,
        "skippedOther": skipped_other,
        "skippedHashedSamples": hashed_samples,
        "sourcePath": source_path,
    })
}

fn parse_known_host_name(token: &str) -> (String, u16) {
    // [host]:port or host
    if let Some(rest) = token.strip_prefix('[') {
        if let Some(end) = rest.find(']') {
            let host = rest[..end].to_string();
            let port = rest[end + 1..]
                .strip_prefix(':')
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(22);
            return (host, port);
        }
    }
    if let Some((h, p)) = token.rsplit_once(':') {
        if let Ok(port) = p.parse::<u16>() {
            // avoid treating IPv6 without brackets as host:port wrongly — only if host has no other colons
            if !h.contains(':') {
                return (h.to_string(), port);
            }
        }
    }
    (token.to_string(), 22)
}
'''
    (ROOT / "src-tauri/src/known_hosts.rs").write_text(kh, encoding="utf-8")
    print("known_hosts extended")
else:
    print("known_hosts already has preview")

# Fix docker map_container name lifetime bug
docker = (ROOT / "src-tauri/src/docker.rs").read_text(encoding="utf-8")
old = '''    let name = names_raw
        .trim_start_matches('/')
        .split(',')
        .next()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| &id[..id.len().min(12)])
        .to_string();'''
new = '''    let name = {
        let cleaned = names_raw.trim_start_matches('/');
        let first = cleaned.split(',').next().unwrap_or("").trim();
        if first.is_empty() {
            id.chars().take(12).collect::<String>()
        } else {
            first.to_string()
        }
    };'''
if old in docker:
    docker = docker.replace(old, new)
    (ROOT / "src-tauri/src/docker.rs").write_text(docker, encoding="utf-8")
    print("docker name fix applied")
else:
    print("docker name pattern not found; check manually")

# Fix container_logs truncation
old2 = '''    let text = if !stdout.is_empty() { stdout } else { stderr };
    Ok(text.chars().rev().take(200_000).collect::<String>().chars().rev().collect())'''
new2 = '''    let text = if !stdout.is_empty() { stdout } else { stderr };
    if text.len() > 200_000 {
        Ok(text[text.len() - 200_000..].to_string())
    } else {
        Ok(text)
    }'''
if old2 in docker:
    docker = (ROOT / "src-tauri/src/docker.rs").read_text(encoding="utf-8")
    docker = docker.replace(old2, new2)
    (ROOT / "src-tauri/src/docker.rs").write_text(docker, encoding="utf-8")
    print("docker logs fix")
else:
    # maybe already different
    docker = (ROOT / "src-tauri/src/docker.rs").read_text(encoding="utf-8")
    if "chars().rev()" in docker:
        docker = docker.replace(
            "Ok(text.chars().rev().take(200_000).collect::<String>().chars().rev().collect())",
            'if text.len() > 200_000 { Ok(text[text.len() - 200_000..].to_string()) } else { Ok(text) }'
        )
        (ROOT / "src-tauri/src/docker.rs").write_text(docker, encoding="utf-8")
        print("docker logs fix alt")
    else:
        print("logs ok")