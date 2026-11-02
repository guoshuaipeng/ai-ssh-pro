from pathlib import Path
p = Path("src-tauri/src/core_memory.rs")
t = p.read_text(encoding="utf-8")
if "pub fn compact_turns" not in t:
    t = t.rstrip() + '''

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
            .join("\\n");
        let now = chrono::Utc::now().timestamp_millis();
        if !piece.is_empty() {
            let merged = if row.running_summary.trim().is_empty() {
                piece.clone()
            } else {
                format!("{}\\n{}", row.running_summary.trim(), piece)
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
                "{}\\n{}",
                row.observational_memory.iter().map(|b| b.text.as_str()).collect::<Vec<_>>().join("\\n"),
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
'''
    # fix accidental double-escaped newlines in format strings - the ''' block used \\n which becomes \n in file - good for Rust source we need \n in strings as \\n in Python raw... 
    # Actually in the Python string above I used \\n inside ''' which writes \n to file - correct for Rust "\n"
    p.write_text(t + "\n", encoding="utf-8")
    print("compact_turns + recall added")
else:
    print("compact_turns exists")
