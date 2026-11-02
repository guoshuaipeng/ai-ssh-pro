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

    pub head: usize,

    #[serde(default)]

    pub tail: usize,

    /// Scarce markers a naive head/tail cut would lose (Electron outsideHeadTail).

    #[serde(default)]

    pub outside_head_tail: Vec<String>,

    /// Hyphenated filler the cite window dropped — must not be re-cited.

    #[serde(default)]

    pub dropped_filler: Vec<String>,

    #[serde(default)]

    pub stable: bool,

    /// Legacy alias kept for older store rows / setCiteHold callers.

    #[serde(default)]

    pub markers: Vec<String>,

    #[serde(default)]

    pub held_at: i64,

}



impl CiteWindow {

    pub fn all_markers(&self) -> Vec<String> {

        let mut out = Vec::new();

        for m in self.outside_head_tail.iter().chain(self.markers.iter()) {

            let s = m.trim();

            if s.is_empty() {

                continue;

            }

            if !out.iter().any(|x: &String| x == s) {

                out.push(s.to_string());

            }

        }

        out

    }

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

        let cleaned: Vec<String> = markers

            .into_iter()

            .map(|m| m.chars().take(120).collect::<String>())

            .filter(|m| !m.trim().is_empty())

            .take(24)

            .collect();

        let hold = CiteWindow {

            head: 0,

            tail: 0,

            outside_head_tail: cleaned.clone(),

            dropped_filler: vec![],

            stable: true,

            markers: cleaned,

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

            let fillers: Vec<String> = row

                .cite_hold

                .as_ref()

                .map(|h| h.dropped_filler.clone())

                .unwrap_or_default();

            let piece_s = scrub_cite_fillers(&piece, &fillers);

            let merged = if row.running_summary.trim().is_empty() {

                piece_s.clone()

            } else {

                format!(

                    "{}\n{}",

                    scrub_cite_fillers(row.running_summary.trim(), &fillers),

                    piece_s

                )

            };

            row.running_summary = cap_summary(&merged);

            // harvest scarce markers / fillers from fresh piece into cite hold

            let scarce = rare_markers(&piece);

            if !scarce.is_empty() || !fillers.is_empty() {

                let mut hold = row.cite_hold.take().unwrap_or_default();

                for m in scarce {

                    if !hold.outside_head_tail.iter().any(|x| x == &m) {

                        hold.outside_head_tail.push(m.clone());

                    }

                    if !hold.markers.iter().any(|x| x == &m) {

                        hold.markers.push(m);

                    }

                }

                hold.outside_head_tail.truncate(16);

                hold.markers.truncate(24);

                hold.held_at = now;

                hold.stable = hold

                    .dropped_filler

                    .iter()

                    .all(|f| !row.running_summary.contains(f));

                row.cite_hold = Some(hold);

            }

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



/// Hybrid recall: keyword + Jaccard overlap + local char-trigram ranks, fused with RRF.

/// The trigram list is a **local** stand-in for embedding (no remote model / no API key).

pub fn recall_episodes(session_key: &str, query: &str, top_k: Option<usize>) -> Value {

    let row = get_thread(session_key);

    recall_episodes_for(&row.episodes, query, top_k)

}



pub fn recall_episodes_for(episodes: &[EpisodicSummary], query: &str, top_k: Option<usize>) -> Value {

    let k = top_k.unwrap_or(5).max(1);

    if episodes.is_empty() || query.trim().is_empty() {

        return json!({ "ok": true, "items": [], "embedding": false, "localTrigram": true });

    }

    let q_tokens = content_tokens(query);

    let q_set: std::collections::HashSet<String> = q_tokens.iter().cloned().collect();

    let mut keyword_scores: Vec<(String, f64)> = Vec::new();

    let mut overlap_scores: Vec<(String, f64)> = Vec::new();

    let mut trigram_scores: Vec<(String, f64)> = Vec::new();

    let q_ng = char_ngrams(query, 3);



    for ep in episodes {

        let blob = format!("{} {}", ep.text, ep.tags.join(" "));

        let doc_tokens = content_tokens(&blob);

        if doc_tokens.is_empty() || q_tokens.is_empty() {

            continue;

        }

        let doc_set: std::collections::HashSet<String> = doc_tokens.iter().cloned().collect();

        let mut hits = 0usize;

        for t in &q_tokens {

            if doc_set.contains(t) {

                hits += 1;

            }

        }

        let keyword = hits as f64 / q_tokens.len() as f64;

        if keyword > 0.0 {

            keyword_scores.push((ep.id.clone(), keyword));

        }

        let mut inter = 0usize;

        for t in &doc_set {

            if q_set.contains(t) {

                inter += 1;

            }

        }

        let mut union = q_set.len() + doc_set.len() - inter;

        if union == 0 {

            union = 1;

        }

        let overlap = inter as f64 / union as f64;

        if overlap > 0.0 {

            overlap_scores.push((ep.id.clone(), overlap));

        }

        let d_ng = char_ngrams(&blob, 3);

        let cos = cosine_sparse(&q_ng, &d_ng);

        if cos > 0.02 {

            trigram_scores.push((ep.id.clone(), cos));

        }

    }



    let lists = vec![

        ("keyword", rank_by_score(&keyword_scores)),

        ("overlap", rank_by_score(&overlap_scores)),

        ("embedding", rank_by_score(&trigram_scores)), // local trigram stand-in

    ];

    let fused = rrf_fuse(&lists, 60);

    let by_id: std::collections::HashMap<&str, &EpisodicSummary> =

        episodes.iter().map(|e| (e.id.as_str(), e)).collect();

    let mut ranked: Vec<_> = fused.into_iter().collect();

    ranked.sort_by(|a, b| {

        b.1.score

            .partial_cmp(&a.1.score)

            .unwrap_or(std::cmp::Ordering::Equal)

            .then_with(|| a.0.cmp(&b.0))

    });

    let items: Vec<Value> = ranked

        .into_iter()

        .take(k)

        .filter_map(|(id, row)| {

            let ep = by_id.get(id.as_str())?;

            Some(json!({

                "id": ep.id,

                "text": ep.text,

                "tags": ep.tags,

                "score": row.score,

                "signals": row.signals,

                "createdAt": ep.created_at,

            }))

        })

        .collect();

    json!({

        "ok": true,

        "items": items,

        "embedding": false,

        "localTrigram": true,

    })

}



fn content_tokens(text: &str) -> Vec<String> {

    let lower = text.to_ascii_lowercase();

    let mut out = Vec::new();

    let mut cur = String::new();

    for ch in lower.chars() {

        if ch.is_ascii_alphanumeric() || ch == '_' || (ch as u32) > 127 {

            cur.push(ch);

        } else if !cur.is_empty() {

            if cur.chars().count() > 1 {

                out.push(cur.clone());

            }

            cur.clear();

        }

    }

    if cur.chars().count() > 1 {

        out.push(cur);

    }

    out

}



fn char_ngrams(text: &str, n: usize) -> std::collections::HashMap<String, f64> {

    let chars: Vec<char> = text.to_ascii_lowercase().chars().filter(|c| !c.is_whitespace()).collect();

    let mut map = std::collections::HashMap::new();

    if chars.len() < n {

        return map;

    }

    for i in 0..=chars.len() - n {

        let gram: String = chars[i..i + n].iter().collect();

        *map.entry(gram).or_insert(0.0) += 1.0;

    }

    map

}



fn cosine_sparse(a: &std::collections::HashMap<String, f64>, b: &std::collections::HashMap<String, f64>) -> f64 {

    if a.is_empty() || b.is_empty() {

        return 0.0;

    }

    let mut dot = 0.0;

    let mut na = 0.0;

    let mut nb = 0.0;

    for (k, va) in a {

        na += va * va;

        if let Some(vb) = b.get(k) {

            dot += va * vb;

        }

    }

    for vb in b.values() {

        nb += vb * vb;

    }

    let denom = (na.sqrt()) * (nb.sqrt());

    if denom <= f64::EPSILON {

        0.0

    } else {

        dot / denom

    }

}



fn rank_by_score(rows: &[(String, f64)]) -> Vec<(String, usize)> {

    let mut ordered: Vec<(String, f64)> = rows

        .iter()

        .filter(|(_, s)| *s > 0.0)

        .cloned()

        .collect();

    ordered.sort_by(|a, b| {

        b.1.partial_cmp(&a.1)

            .unwrap_or(std::cmp::Ordering::Equal)

            .then_with(|| a.0.cmp(&b.0))

    });

    ordered

        .into_iter()

        .enumerate()

        .map(|(i, (id, _))| (id, i + 1))

        .collect()

}



struct FusedHit {

    score: f64,

    signals: Vec<String>,

}



fn rrf_fuse(lists: &[(&str, Vec<(String, usize)>)], rrf_k: usize) -> std::collections::HashMap<String, FusedHit> {

    let mut fused: std::collections::HashMap<String, FusedHit> = std::collections::HashMap::new();

    for (signal, ranks) in lists {

        for (id, rank) in ranks {

            let entry = fused.entry(id.clone()).or_insert(FusedHit {

                score: 0.0,

                signals: vec![],

            });

            entry.score += 1.0 / (rrf_k as f64 + *rank as f64);

            if !entry.signals.iter().any(|s| s == signal) {

                entry.signals.push((*signal).to_string());

            }

        }

    }

    fused

}



/// Scrub dropped fillers out of text (Electron scrubCiteFillers).

pub fn scrub_cite_fillers(text: &str, fillers: &[String]) -> String {

    let mut out = text.to_string();

    for filler in fillers {

        let f = filler.trim();

        if f.is_empty() || !out.contains(f) {

            continue;

        }

        out = out.replace(f, "");

    }

    out

}



/// Rare evidence tokens: uppercase run length >= 8 (Electron RARE_TOKEN).

pub fn rare_markers(text: &str) -> Vec<String> {

    let mut out = Vec::new();

    let mut cur = String::new();

    let flush = |cur: &mut String, out: &mut Vec<String>| {

        if cur.len() >= 8 && cur.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false) {

            if !out.iter().any(|x| x == cur) {

                out.push(cur.clone());

            }

        }

        cur.clear();

    };

    for ch in text.chars() {

        if ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_' {

            if cur.is_empty() {

                if ch.is_ascii_uppercase() {

                    cur.push(ch);

                }

            } else {

                cur.push(ch);

            }

        } else {

            flush(&mut cur, &mut out);

        }

    }

    flush(&mut cur, &mut out);

    out

}



/// Apply cite scrub to a running summary / observations using held fillers.

pub fn apply_cite_scrub(session_key: &str, text: &str) -> Value {

    let row = get_thread(session_key);

    let fillers = row

        .cite_hold

        .as_ref()

        .map(|h| h.dropped_filler.clone())

        .unwrap_or_default();

    let markers = row

        .cite_hold

        .as_ref()

        .map(|h| h.all_markers())

        .unwrap_or_default();

    let scrubbed = scrub_cite_fillers(text, &fillers);

    json!({

        "ok": true,

        "text": scrubbed,

        "droppedFiller": fillers,

        "markers": markers,

    })

}







#[cfg(test)]

mod tests {

    use super::*;



    #[test]

    fn scrub_removes_dropped_fillers() {

        let fillers = vec!["soft-batch-noise".into(), "other-filler-token".into()];

        let text = "ALPHA_MARKER_01 soft-batch-noise kept other-filler-token end";

        let out = scrub_cite_fillers(text, &fillers);

        assert!(!out.contains("soft-batch-noise"));

        assert!(!out.contains("other-filler-token"));

        assert!(out.contains("ALPHA_MARKER_01"));

    }



    #[test]

    fn rare_markers_find_uppercase_runs() {

        let ms = rare_markers("see ALPHA_MARKER_01 and short OK skip");

        assert!(ms.iter().any(|m| m == "ALPHA_MARKER_01"));

        assert!(!ms.iter().any(|m| m == "OK"));

    }



    #[test]

    fn recall_prefers_related_episode() {

        let eps = vec![

            EpisodicSummary {

                id: "1".into(),

                text: "nginx 启动失败 journalctl 看了 unit".into(),

                tags: vec!["nginx".into(), "compact".into()],

                source_chars: 20,

                created_at: 1,

            },

            EpisodicSummary {

                id: "2".into(),

                text: "mysql 备份完成".into(),

                tags: vec!["mysql".into()],

                source_chars: 10,

                created_at: 2,

            },

        ];

        let v = recall_episodes_for(&eps, "nginx 为什么启动失败", Some(5));

        let items = v.get("items").and_then(|x| x.as_array()).cloned().unwrap_or_default();

        assert!(!items.is_empty());

        assert_eq!(items[0].get("id").and_then(|x| x.as_str()), Some("1"));

        assert!(!items.iter().any(|it| it.get("id").and_then(|x| x.as_str()) == Some("2") && items.len() == 1));

        let signals = items[0].get("signals").cloned().unwrap_or(json!([]));

        assert!(signals.as_array().map(|a| !a.is_empty()).unwrap_or(false));

    }



    #[test]

    fn recall_respects_topk() {

        let mut eps = Vec::new();

        for i in 0..12 {

            eps.push(EpisodicSummary {

                id: format!("e{i}"),

                text: format!("nginx failure case {i} journal"),

                tags: vec!["nginx".into()],

                source_chars: 8,

                created_at: i as i64,

            });

        }

        let v = recall_episodes_for(&eps, "nginx journal failure", Some(5));

        let items = v.get("items").and_then(|x| x.as_array()).cloned().unwrap_or_default();

        assert_eq!(items.len(), 5);

    }



    #[test]

    fn compact_turns_scrubs_fillers_from_summary() {

        lazy_static_like::with(|| {

            let key = "test-compact-scrub";

            let mut map = load_all();

            let mut row = ThreadRecord::default();

            row.cite_hold = Some(CiteWindow {

                dropped_filler: vec!["soft-batch-noise".into()],

                outside_head_tail: vec!["ALPHA_MARKER_01".into()],

                markers: vec!["ALPHA_MARKER_01".into()],

                stable: false,

                ..Default::default()

            });

            map.insert(normalize_key(key), row);

            save_all(&map);

        });

        let mut turns = Vec::new();

        for i in 0..20 {

            turns.push(json!({

                "role": if i % 2 == 0 { "user" } else { "assistant" },

                "content": format!("turn {i} soft-batch-noise ALPHA_MARKER_01 detail"),

            }));

        }

        let out = compact_turns("test-compact-scrub", turns, Some(4));

        let summary = out.get("runningSummary").and_then(|x| x.as_str()).unwrap_or("");

        assert!(!summary.contains("soft-batch-noise"), "summary={summary}");

        assert!(out.get("ok").and_then(|x| x.as_bool()).unwrap_or(false));

    }

}

