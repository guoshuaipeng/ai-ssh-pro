//! Core-A thread memory: notes, task summaries, working goal, observational bullets, multi-thread.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::store;

const MAX_OBS: usize = 40;
const MAX_OBS_CHARS: usize = 180;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkingMemory {
    pub goal: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationBullet {
    pub id: String,
    pub text: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodicSummary {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub source_chars: u64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CiteWindow {
    #[serde(default)]
    pub markers: Vec<String>,
    #[serde(default)]
    pub held_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRecord {
    pub notes: Vec<String>,
    pub task_summaries: Vec<String>,
    pub working_memory: Option<WorkingMemory>,
    #[serde(default)]
    pub observational_memory: Vec<ObservationBullet>,
    #[serde(default)]
    pub episodes: Vec<EpisodicSummary>,
    #[serde(default)]
    pub running_summary: String,
    #[serde(default)]
    pub cite_hold: Option<CiteWindow>,
    #[serde(default)]
    pub compacted_cursor: Option<String>,
    #[serde(default)]
    pub epoch: u64,
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
    (format!("archived-goal: {g}"), format!("[done] {g}"))
}

pub fn get_thread(session_key: &str) -> ThreadRecord {
    lazy_static_like::with(|| {
        let map = load_all();
        map.get(&normalize_key(session_key))
            .cloned()
            .unwrap_or_default()
    })
}

pub fn list_threads() -> Value {
    lazy_static_like::with(|| {
        let map = load_all();
        let mut rows: Vec<Value> = map
            .iter()
            .map(|(k, v)| {
                json!({
                    "sessionKey": k,
                    "updatedAt": v.updated_at,
                    "epoch": v.epoch,
                    "goal": v.working_memory.as_ref().map(|w| w.goal.clone()).unwrap_or_default(),
                    "notes": v.notes.len(),
                    "observations": v.observational_memory.len(),
                    "taskSummaries": v.task_summaries.len(),
                })
            })
            .collect();
        rows.sort_by(|a, b| {
            b.get("updatedAt")
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
                .cmp(&a.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0))
        });
        json!(rows)
    })
}

pub fn bump_epoch(session_key: &str) -> u64 {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        let mut row = map.remove(&key).unwrap_or_default();
        row.epoch = row.epoch.saturating_add(1);
        row.updated_at = chrono::Utc::now().timestamp_millis();
        let e = row.epoch;
        map.insert(key, row);
        save_all(&map);
        e
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

fn cap_observations(mut bullets: Vec<ObservationBullet>) -> Vec<ObservationBullet> {
    if bullets.len() <= MAX_OBS {
        return bullets;
    }
    let drop_n = bullets.len() - MAX_OBS;
    bullets.drain(..drop_n);
    bullets
}

pub fn append_observations(session_key: &str, texts: Vec<String>) -> Vec<ObservationBullet> {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        let mut row = map.remove(&key).unwrap_or_default();
        let now = chrono::Utc::now().timestamp_millis();
        for (i, text) in texts.into_iter().enumerate() {
            let t: String = text.trim().chars().take(MAX_OBS_CHARS).collect();
            if t.is_empty() {
                continue;
            }
            if row.observational_memory.iter().any(|b| b.text == t) {
                continue;
            }
            row.observational_memory.push(ObservationBullet {
                id: format!("om-{}-{}", now, i),
                text: t,
                created_at: now,
            });
        }
        row.observational_memory = cap_observations(row.observational_memory);
        row.updated_at = now;
        let out = row.observational_memory.clone();
        map.insert(key, row);
        save_all(&map);
        out
    })
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
            row.task_summaries
                .iter()
                .rev()
                .take(4)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n- ")
        ));
    }
    if !row.notes.is_empty() {
        parts.push(format!(
            "归档笔记:\n- {}",
            row.notes
                .iter()
                .rev()
                .take(4)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n- ")
        ));
    }
    if !row.observational_memory.is_empty() {
        parts.push(format!(
            "观测记忆:\n- {}",
            row.observational_memory
                .iter()
                .rev()
                .take(8)
                .map(|b| b.text.clone())
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n- ")
        ));
    }
    if !row.running_summary.trim().is_empty() {
        let summary = row.running_summary.chars().rev().take(1500).collect::<String>().chars().rev().collect::<String>();
        parts.push(format!("滚动摘要:\n{}", summary.trim()));
    }
    if !row.episodes.is_empty() {
        parts.push(format!(
            "情节记忆:\n- {}",
            row.episodes
                .iter()
                .rev()
                .take(6)
                .map(|e| e.text.clone())
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n- ")
        ));
    }
    if let Some(hold) = &row.cite_hold {
        if !hold.markers.is_empty() {
            parts.push(format!(
                "引用保留:\n- {}",
                hold.markers.iter().rev().take(8).cloned().collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n- ")
            ));
        }
    }
    parts.join("\n")
}

pub fn as_json(session_key: &str) -> Value {
    json!(get_thread(session_key))
}


const MAX_EPISODES: usize = 40;
const MAX_SUMMARY_CHARS: usize = 1500;

fn cap_summary(text: &str) -> String {
    let t = text.trim();
    if t.chars().count() <= MAX_SUMMARY_CHARS {
        return t.to_string();
    }
    let chars: Vec<char> = t.chars().collect();
    let keep = MAX_SUMMARY_CHARS / 2;
    let head: String = chars.iter().take(keep).collect();
    let tail: String = chars.iter().rev().take(keep).collect::<String>().chars().rev().collect();
    format!("{head}\n…\n{tail}")
}

pub fn append_episode(session_key: &str, text: &str, tags: Vec<String>) -> EpisodicSummary {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        let mut row = map.remove(&key).unwrap_or_default();
        let now = chrono::Utc::now().timestamp_millis();
        let ep = EpisodicSummary {
            id: uuid::Uuid::new_v4().to_string(),
            text: text.chars().take(400).collect(),
            tags: tags.into_iter().take(8).collect(),
            source_chars: text.len() as u64,
            created_at: now,
        };
        row.episodes.push(ep.clone());
        if row.episodes.len() > MAX_EPISODES {
            let drop_n = row.episodes.len() - MAX_EPISODES;
            row.episodes.drain(0..drop_n);
        }
        row.updated_at = now;
        map.insert(key, row);
        save_all(&map);
        ep
    })
}

pub fn set_cite_hold(session_key: &str, markers: Vec<String>) -> CiteWindow {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        let mut row = map.remove(&key).unwrap_or_default();
        let now = chrono::Utc::now().timestamp_millis();
        let hold = CiteWindow {
            markers: markers
                .into_iter()
                .map(|m| m.chars().take(120).collect::<String>())
                .filter(|m| !m.trim().is_empty())
                .take(24)
                .collect(),
            held_at: now,
        };
        row.cite_hold = Some(hold.clone());
        row.updated_at = now;
        map.insert(key, row);
        save_all(&map);
        hold
    })
}

/// Extractive compress: fold piece into runningSummary and optionally emit an episode.
pub fn compress_transcript(session_key: &str, piece: &str, cursor: Option<String>) -> Value {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        let mut row = map.remove(&key).unwrap_or_default();
        let now = chrono::Utc::now().timestamp_millis();
        let piece = piece.trim();
        if piece.is_empty() {
            map.insert(key, row.clone());
            save_all(&map);
            return json!({ "ok": true, "runningSummary": row.running_summary, "skipped": "empty" });
        }
        if let (Some(c), Some(prev)) = (cursor.as_ref(), row.compacted_cursor.as_ref()) {
            if c == prev && !row.running_summary.is_empty() {
                map.insert(key, row.clone());
                save_all(&map);
                return json!({ "ok": true, "runningSummary": row.running_summary, "skipped": "same-cursor" });
            }
        }
        let merged = if row.running_summary.trim().is_empty() {
            piece.to_string()
        } else {
            format!("{}\n{}", row.running_summary.trim(), piece)
        };
        row.running_summary = cap_summary(&merged);
        if let Some(c) = cursor {
            row.compacted_cursor = Some(c);
        }
        if piece.chars().count() >= 40 {
            row.episodes.push(EpisodicSummary {
                id: uuid::Uuid::new_v4().to_string(),
                text: piece.chars().take(400).collect(),
                tags: vec!["compress".into()],
                source_chars: piece.len() as u64,
                created_at: now,
            });
            if row.episodes.len() > MAX_EPISODES {
                let drop_n = row.episodes.len() - MAX_EPISODES;
                row.episodes.drain(0..drop_n);
            }
        }
        if let Some(hold) = row.cite_hold.as_mut() {
            let blob = format!(
                "{}\n{}",
                row.observational_memory.iter().map(|b| b.text.as_str()).collect::<Vec<_>>().join("\n"),
                row.running_summary
            );
            hold.markers.retain(|m| blob.contains(m));
            hold.held_at = now;
        }
        row.updated_at = now;
        let summary = row.running_summary.clone();
        map.insert(key, row);
        save_all(&map);
        json!({ "ok": true, "runningSummary": summary })
    })
}

/// Extractive compact over transcript turns (Electron compactTranscript subset; no embedding).
pub fn compact_turns(session_key: &str, turns: Vec<Value>, max_turns: Option<usize>) -> Value {
    lazy_static_like::with(|| {
        let key = normalize_key(session_key);
        let mut map = load_all();
        let mut row = map.remove(&key).unwrap_or_default();
        let max_messages = max_turns.unwrap_or(12).max(2) * 2;
        if turns.len() <= max_messages {
            map.insert(key, row.clone());
            save_all(&map);
            return json!({
                "ok": true,
                "recent": turns,
                "runningSummary": row.running_summary,
                "episodes": row.episodes,
                "skipped": "within-window",
            });
        }
        let older = &turns[..turns.len() - max_messages];
        let recent = turns[turns.len() - max_messages..].to_vec();
        let last = older.last();
        let cursor = last.and_then(|t| {
            let role = t.get("role").and_then(|x| x.as_str()).unwrap_or("");
            let content = t.get("content").and_then(|x| x.as_str()).unwrap_or("");
            Some(format!("{role}:{}", content.chars().take(80).collect::<String>()))
        });
        if let (Some(c), Some(prev)) = (cursor.as_ref(), row.compacted_cursor.as_ref()) {
            if c == prev && !row.running_summary.is_empty() {
                map.insert(key, row.clone());
                save_all(&map);
                return json!({
                    "ok": true,
                    "recent": recent,
                    "runningSummary": row.running_summary,
                    "skipped": "same-cursor",
                });
            }
        }
        let mut start = 0usize;
        if let Some(prev) = row.compacted_cursor.clone() {
            for (i, turn) in older.iter().enumerate() {
                let role = turn.get("role").and_then(|x| x.as_str()).unwrap_or("");
                let content = turn.get("content").and_then(|x| x.as_str()).unwrap_or("");
                let fp = format!("{role}:{}", content.chars().take(80).collect::<String>());
                if fp == prev {
                    start = i + 1;
                }
            }
        }
        let fresh = &older[start..];
        let piece = fresh
            .iter()
            .filter_map(|t| {
                let role = t.get("role").and_then(|x| x.as_str()).unwrap_or("?");
                let content = t.get("content").and_then(|x| x.as_str()).unwrap_or("").trim();
                if content.is_empty() {
                    None
                } else {
                    Some(format!("{role}: {}", content.chars().take(240).collect::<String>()))
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        let now = chrono::Utc::now().timestamp_millis();
        if !piece.is_empty() {
            let merged = if row.running_summary.trim().is_empty() {
                piece.clone()
            } else {
                format!("{}\n{}", row.running_summary.trim(), piece)
            };
            row.running_summary = cap_summary(&merged);
            if piece.chars().count() >= 40 {
                row.episodes.push(EpisodicSummary {
                    id: uuid::Uuid::new_v4().to_string(),
                    text: piece.chars().take(400).collect(),
                    tags: vec!["compact".into()],
                    source_chars: piece.len() as u64,
                    created_at: now,
                });
                if row.episodes.len() > MAX_EPISODES {
                    let drop_n = row.episodes.len() - MAX_EPISODES;
                    row.episodes.drain(0..drop_n);
                }
            }
            // lightweight observations from fresh lines
            for line in piece.lines().take(8) {
                let text = line.chars().take(MAX_OBS_CHARS).collect::<String>();
                if text.trim().is_empty() {
                    continue;
                }
                row.observational_memory.push(ObservationBullet {
                    id: uuid::Uuid::new_v4().to_string(),
                    text,
                    created_at: now,
                });
            }
            row.observational_memory = cap_observations(row.observational_memory);
        }
        if let Some(c) = cursor {
            row.compacted_cursor = Some(c);
        }
        // scrub cite hold against summary+obs
        if let Some(hold) = row.cite_hold.as_mut() {
            let blob = format!(
                "{}\n{}",
                row.observational_memory.iter().map(|b| b.text.as_str()).collect::<Vec<_>>().join("\n"),
                row.running_summary
            );
            hold.markers.retain(|m| blob.contains(m));
            hold.held_at = now;
        }
        row.updated_at = now;
        let summary = row.running_summary.clone();
        let episodes = row.episodes.clone();
        map.insert(key, row);
        save_all(&map);
        json!({
            "ok": true,
            "recent": recent,
            "runningSummary": summary,
            "episodes": episodes,
        })
    })
}

/// Rank episodes by simple keyword overlap (embedding hook reserved).
pub fn recall_episodes(session_key: &str, query: &str, top_k: Option<usize>) -> Value {
    let row = get_thread(session_key);
    let q = query.to_ascii_lowercase();
    let tokens: Vec<&str> = q.split_whitespace().filter(|t| t.len() > 1).collect();
    let mut scored: Vec<(i64, &EpisodicSummary)> = row
        .episodes
        .iter()
        .map(|ep| {
            let text = ep.text.to_ascii_lowercase();
            let mut score = 0i64;
            for t in &tokens {
                if text.contains(t) {
                    score += 1;
                }
            }
            for tag in &ep.tags {
                if q.contains(&tag.to_ascii_lowercase()) {
                    score += 2;
                }
            }
            (score, ep)
        })
        .filter(|(s, _)| *s > 0)
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.created_at.cmp(&a.1.created_at)));
    let k = top_k.unwrap_or(5).max(1);
    let items: Vec<Value> = scored
        .into_iter()
        .take(k)
        .map(|(score, ep)| {
            json!({
                "id": ep.id,
                "text": ep.text,
                "tags": ep.tags,
                "score": score,
                "signal": "keyword",
                "createdAt": ep.created_at,
            })
        })
        .collect();
    json!({ "ok": true, "items": items, "embedding": false })
}

