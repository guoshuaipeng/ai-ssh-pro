//! Minimal Core-A thread memory: notes + task summaries + working goal (HITL archive).
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::store;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkingMemory {
    pub goal: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRecord {
    pub notes: Vec<String>,
    pub task_summaries: Vec<String>,
    pub working_memory: Option<WorkingMemory>,
    pub updated_at: i64,
}

fn path() -> PathBuf {
    store::data_dir().join("core-a-memory.json")
}

fn load_all() -> HashMap<String, ThreadRecord> {
    fs::read_to_string(path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_all(map: &HashMap<String, ThreadRecord>) {
    let _ = fs::create_dir_all(store::data_dir());
    let _ = fs::write(
        path(),
        serde_json::to_string_pretty(map).unwrap_or_else(|_| "{}".into()),
    );
}

mod lazy_static_like {
    use super::*;
    use std::sync::OnceLock;
    pub fn lock() -> &'static Mutex<()> {
        static L: OnceLock<Mutex<()>> = OnceLock::new();
        L.get_or_init(|| Mutex::new(()))
    }
    pub fn with<R>(f: impl FnOnce() -> R) -> R {
        let _g = lock().lock().ok();
        f()
    }
}

fn normalize_key(key: &str) -> String {
    let k = key.trim();
    if k.is_empty() {
        "default".into()
    } else {
        k.chars().take(200).collect()
    }
}

pub fn format_archived_goal(goal: &str) -> (String, String) {
    let g: String = goal.chars().take(180).collect();
    let g = g.trim();
    (
        format!("archived-goal: {g}"),
        format!("[done] {g}"),
    )
}

pub fn get_thread(session_key: &str) -> ThreadRecord {
    lazy_static_like::with(|| {
        let map = load_all();
        map.get(&normalize_key(session_key))
            .cloned()
            .unwrap_or_default()
    })
}

pub fn append_archive(session_key: &str, note: &str, task_summary: &str) {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        let mut row = map.remove(&key).unwrap_or_default();
        let note = note.trim();
        let task = task_summary.trim();
        if !note.is_empty() {
            row.notes.push(note.to_string());
            if row.notes.len() > 8 {
                let skip = row.notes.len() - 8;
                row.notes.drain(..skip);
            }
        }
        if !task.is_empty() {
            row.task_summaries.push(task.to_string());
            if row.task_summaries.len() > 6 {
                let skip = row.task_summaries.len() - 6;
                row.task_summaries.drain(..skip);
            }
        }
        row.updated_at = chrono::Utc::now().timestamp_millis();
        map.insert(key, row);
        save_all(&map);
    });
}

pub fn archive_goal(session_key: &str, goal: &str) {
    let (note, task) = format_archived_goal(goal);
    append_archive(session_key, &note, &task);
}

pub fn set_working_goal(session_key: &str, goal: &str) {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        let mut row = map.remove(&key).unwrap_or_default();
        let g = goal.trim();
        if let Some(prev) = row.working_memory.take() {
            if !prev.goal.is_empty() && prev.goal != g {
                let (note, task) = format_archived_goal(&prev.goal);
                if !note.is_empty() {
                    row.notes.push(note);
                    if row.notes.len() > 8 {
                        let skip = row.notes.len() - 8;
                        row.notes.drain(..skip);
                    }
                }
                if !task.is_empty() {
                    row.task_summaries.push(task);
                    if row.task_summaries.len() > 6 {
                        let skip = row.task_summaries.len() - 6;
                        row.task_summaries.drain(..skip);
                    }
                }
            }
        }
        if !g.is_empty() {
            row.working_memory = Some(WorkingMemory {
                goal: g.to_string(),
                updated_at: chrono::Utc::now().timestamp_millis(),
            });
        }
        row.updated_at = chrono::Utc::now().timestamp_millis();
        map.insert(key, row);
        save_all(&map);
    });
}

pub fn clear_working(session_key: &str) {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        if let Some(row) = map.get_mut(&key) {
            if let Some(prev) = row.working_memory.take() {
                let (note, task) = format_archived_goal(&prev.goal);
                if !note.is_empty() {
                    row.notes.push(note);
                    if row.notes.len() > 8 {
                        let skip = row.notes.len() - 8;
                        row.notes.drain(..skip);
                    }
                }
                if !task.is_empty() {
                    row.task_summaries.push(task);
                    if row.task_summaries.len() > 6 {
                        let skip = row.task_summaries.len() - 6;
                        row.task_summaries.drain(..skip);
                    }
                }
            }
            row.updated_at = chrono::Utc::now().timestamp_millis();
            save_all(&map);
        }
    });
}

pub fn context_for_prompt(session_key: &str) -> String {
    let row = get_thread(session_key);
    let mut parts = Vec::new();
    if let Some(wm) = &row.working_memory {
        if !wm.goal.is_empty() {
            parts.push(format!("当前目标: {}", wm.goal));
        }
    }
    if !row.task_summaries.is_empty() {
        parts.push(format!(
            "近期任务摘要:\n- {}",
            row.task_summaries.iter().rev().take(4).cloned().collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n- ")
        ));
    }
    if !row.notes.is_empty() {
        parts.push(format!(
            "归档笔记:\n- {}",
            row.notes.iter().rev().take(4).cloned().collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n- ")
        ));
    }
    parts.join("\n")
}

pub fn as_json(session_key: &str) -> Value {
    json!(get_thread(session_key))
}
