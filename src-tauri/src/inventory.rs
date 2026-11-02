//! Host inventory store (Electron ~/.ai-ssh-pro/inventory compatible shape under app data).
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use crate::store;

const CONTEXT_MAX: usize = 6000;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostService {
    pub name: String,
    pub kind: Option<String>,
    pub ports: Option<Vec<u32>>,
    pub unit: Option<String>,
    pub image: Option<String>,
    pub compose_dir: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostMeta {
    pub id: String,
    pub title: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub profile_id: Option<String>,
    pub private_key_path: Option<String>,
    pub tags: Option<Vec<String>>,
    pub env: Option<String>,
    pub updated_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRecord {
    pub meta: HostMeta,
    pub services: Vec<HostService>,
    pub notes_markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexEntry {
    id: String,
    title: String,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    profile_id: Option<String>,
    tags: Option<Vec<String>>,
    updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexFile {
    version: u32,
    hosts: Vec<IndexEntry>,
}

fn root() -> PathBuf {
    store::data_dir().join("inventory")
}

fn index_path() -> PathBuf {
    root().join("index.json")
}

fn host_dir(id: &str) -> PathBuf {
    root().join("hosts").join(id)
}

fn ensure() {
    let _ = fs::create_dir_all(root().join("hosts"));
    if !index_path().exists() {
        let _ = fs::write(
            index_path(),
            serde_json::to_string_pretty(&IndexFile {
                version: 1,
                hosts: vec![],
            })
            .unwrap_or_else(|_| "{\"version\":1,\"hosts\":[]}".into()),
        );
    }
}

fn read_index() -> IndexFile {
    ensure();
    fs::read_to_string(index_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(IndexFile {
            version: 1,
            hosts: vec![],
        })
}

fn write_index(idx: &IndexFile) {
    ensure();
    let _ = fs::write(
        index_path(),
        serde_json::to_string_pretty(idx).unwrap_or_else(|_| "{}".into()),
    );
}

fn slugify(raw: &str) -> String {
    let s: String = raw
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let s = s.trim_matches('-').chars().take(64).collect::<String>();
    if s.is_empty() {
        format!("host-{}", &uuid::Uuid::new_v4().to_string()[..8])
    } else {
        s
    }
}

pub fn list() -> Value {
    let idx = read_index();
    json!(idx.hosts)
}

pub fn get(id: &str) -> Option<HostRecord> {
    let dir = host_dir(id);
    let meta: HostMeta = fs::read_to_string(dir.join("meta.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())?;
    let services: Vec<HostService> = fs::read_to_string(dir.join("services.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| {
            v.get("services")
                .cloned()
                .and_then(|s| serde_json::from_value(s).ok())
        })
        .unwrap_or_default();
    let notes = fs::read_to_string(dir.join("notes.md")).unwrap_or_default();
    Some(HostRecord {
        meta,
        services,
        notes_markdown: notes,
    })
}

pub fn search(query: &str) -> Value {
    let q = query.trim().to_lowercase();
    let idx = read_index();
    if q.is_empty() {
        return json!(idx.hosts);
    }
    let hits: Vec<_> = idx
        .hosts
        .into_iter()
        .filter(|h| {
            h.title.to_lowercase().contains(&q)
                || h.host
                    .as_ref()
                    .map(|x| x.to_lowercase().contains(&q))
                    .unwrap_or(false)
                || h.id.to_lowercase().contains(&q)
                || h.tags
                    .as_ref()
                    .map(|t| t.iter().any(|x| x.to_lowercase().contains(&q)))
                    .unwrap_or(false)
        })
        .collect();
    json!(hits)
}

pub fn upsert(input: Value) -> Result<HostRecord, String> {
    ensure();
    let title = input
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if title.is_empty() {
        return Err("title required".into());
    }
    let now = chrono::Utc::now().timestamp_millis();
    let id = input
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let host = input
                .get("host")
                .and_then(|v| v.as_str())
                .unwrap_or(&title);
            slugify(host)
        });
    let existing = get(&id);
    let created = existing
        .as_ref()
        .map(|e| e.meta.created_at)
        .unwrap_or(now);
    let services: Vec<HostService> = input
        .get("services")
        .cloned()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_else(|| existing.as_ref().map(|e| e.services.clone()).unwrap_or_default());
    let notes = input
        .get("notesMarkdown")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|e| e.notes_markdown.clone())
                .unwrap_or_default()
        });
    let meta = HostMeta {
        id: id.clone(),
        title,
        host: input
            .get("host")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| existing.as_ref().and_then(|e| e.meta.host.clone())),
        port: input
            .get("port")
            .and_then(|v| v.as_u64())
            .map(|n| n as u16)
            .or_else(|| existing.as_ref().and_then(|e| e.meta.port)),
        username: input
            .get("username")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| existing.as_ref().and_then(|e| e.meta.username.clone())),
        profile_id: input
            .get("profileId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| existing.as_ref().and_then(|e| e.meta.profile_id.clone())),
        private_key_path: input
            .get("privateKeyPath")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| existing.as_ref().and_then(|e| e.meta.private_key_path.clone())),
        tags: input
            .get("tags")
            .cloned()
            .and_then(|v| serde_json::from_value(v).ok())
            .or_else(|| existing.as_ref().and_then(|e| e.meta.tags.clone())),
        env: input
            .get("env")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| existing.as_ref().and_then(|e| e.meta.env.clone())),
        updated_at: now,
        created_at: created,
    };
    let dir = host_dir(&id);
    let _ = fs::create_dir_all(&dir);
    let _ = fs::write(
        dir.join("meta.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    );
    let _ = fs::write(
        dir.join("services.json"),
        serde_json::to_string_pretty(&json!({ "hostId": id, "updatedAt": now, "services": services }))
            .unwrap_or_default(),
    );
    let _ = fs::write(dir.join("notes.md"), &notes);
    let mut idx = read_index();
    idx.hosts.retain(|h| h.id != id);
    idx.hosts.push(IndexEntry {
        id: id.clone(),
        title: meta.title.clone(),
        host: meta.host.clone(),
        port: meta.port,
        username: meta.username.clone(),
        profile_id: meta.profile_id.clone(),
        tags: meta.tags.clone(),
        updated_at: now,
    });
    idx.hosts.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    write_index(&idx);
    Ok(HostRecord {
        meta,
        services,
        notes_markdown: notes,
    })
}

pub fn remove(id: &str) -> bool {
    let dir = host_dir(id);
    let _ = fs::remove_dir_all(&dir);
    let mut idx = read_index();
    let before = idx.hosts.len();
    idx.hosts.retain(|h| h.id != id);
    write_index(&idx);
    before != idx.hosts.len()
}

pub fn upsert_service(host_id: &str, service: Value) -> Result<HostRecord, String> {
    let mut rec = get(host_id).ok_or_else(|| format!("host {host_id} not found"))?;
    let name = service
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if name.is_empty() {
        return Err("service.name required".into());
    }
    let svc: HostService = serde_json::from_value(service).map_err(|e| e.to_string())?;
    if let Some(existing) = rec.services.iter_mut().find(|s| s.name == name) {
        *existing = svc;
    } else {
        rec.services.push(svc);
    }
    upsert(json!({
        "id": rec.meta.id,
        "title": rec.meta.title,
        "host": rec.meta.host,
        "port": rec.meta.port,
        "username": rec.meta.username,
        "profileId": rec.meta.profile_id,
        "services": rec.services,
        "notesMarkdown": rec.notes_markdown,
    }))
}

pub fn append_note(host_id: &str, note: &str) -> Result<HostRecord, String> {
    let mut rec = get(host_id).ok_or_else(|| format!("host {host_id} not found"))?;
    let n = note.trim();
    if n.is_empty() {
        return Err("note empty".into());
    }
    if !rec.notes_markdown.is_empty() && !rec.notes_markdown.ends_with('\n') {
        rec.notes_markdown.push('\n');
    }
    rec.notes_markdown.push_str(n);
    rec.notes_markdown.push('\n');
    upsert(json!({
        "id": rec.meta.id,
        "title": rec.meta.title,
        "host": rec.meta.host,
        "port": rec.meta.port,
        "username": rec.meta.username,
        "profileId": rec.meta.profile_id,
        "services": rec.services,
        "notesMarkdown": rec.notes_markdown,
    }))
}

pub fn format_context(host_id: Option<&str>, host: Option<&str>, port: Option<u16>) -> String {
    let rec = if let Some(id) = host_id {
        get(id)
    } else if let Some(h) = host {
        let idx = read_index();
        let id = idx.hosts.iter().find(|e| {
            e.host.as_deref() == Some(h)
                && (port.is_none() || e.port == port || (port == Some(22) && e.port.is_none()))
        });
        id.and_then(|e| get(&e.id))
    } else {
        None
    };
    let Some(rec) = rec else {
        return String::new();
    };
    let mut out = format!(
        "# {} ({})\nhost={} port={} user={}\n",
        rec.meta.title,
        rec.meta.id,
        rec.meta.host.as_deref().unwrap_or("-"),
        rec.meta.port.unwrap_or(22),
        rec.meta.username.as_deref().unwrap_or("-")
    );
    if !rec.services.is_empty() {
        out.push_str("## services\n");
        for s in &rec.services {
            out.push_str(&format!(
                "- {} ({})\n",
                s.name,
                s.kind.as_deref().unwrap_or("unknown")
            ));
        }
    }
    if !rec.notes_markdown.trim().is_empty() {
        out.push_str("## notes\n");
        out.push_str(rec.notes_markdown.trim());
        out.push('\n');
    }
    if out.len() > CONTEXT_MAX {
        out.truncate(CONTEXT_MAX);
        out.push_str("\n…");
    }
    out
}

pub fn set_services(host_id: &str, services: Value) -> Result<HostRecord, String> {
    let rec = get(host_id).ok_or_else(|| format!("host {host_id} not found"))?;
    let list: Vec<HostService> = serde_json::from_value(services).map_err(|e| e.to_string())?;
    upsert(json!({
        "id": rec.meta.id,
        "title": rec.meta.title,
        "host": rec.meta.host,
        "port": rec.meta.port,
        "username": rec.meta.username,
        "profileId": rec.meta.profile_id,
        "services": list,
        "notesMarkdown": rec.notes_markdown,
    }))
}
