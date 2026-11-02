from pathlib import Path
import re

# ========== core_memory.rs Round-10 ==========
p = Path("src-tauri/src/core_memory.rs")
t = p.read_text(encoding="utf-8")

old_cite = '''#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CiteWindow {
    #[serde(default)]
    pub markers: Vec<String>,
    #[serde(default)]
    pub held_at: i64,
}'''

new_cite = '''#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
}'''

if old_cite not in t:
    raise SystemExit("CiteWindow block missing")
t = t.replace(old_cite, new_cite, 1)

# Update set_cite_hold to populate outside_head_tail
old_hold = '''        let hold = CiteWindow {
            markers: markers
                .into_iter()
                .map(|m| m.chars().take(120).collect::<String>())
                .filter(|m| !m.trim().is_empty())
                .take(24)
                .collect(),
            held_at: now,
        };'''
new_hold = '''        let cleaned: Vec<String> = markers
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
        };'''
if old_hold not in t:
    raise SystemExit("set_cite_hold block missing")
t = t.replace(old_hold, new_hold, 1)

# Replace recall_episodes entirely
old_recall_start = t.find("/// Rank episodes by simple keyword overlap (embedding hook reserved).")
if old_recall_start < 0:
    raise SystemExit("recall start missing")
# find end of function - next pub fn or end of file before tests
rest = t[old_recall_start:]
# End at last closing of recall - look for `\n}\n\n` after the function - the function ends with embedding: false }})
m = re.search(
    r'/// Rank episodes by simple keyword overlap.*?\n\}\n',
    t[old_recall_start:],
    re.S,
)
if not m:
    raise SystemExit("recall fn match failed")
new_recall = r'''/// Hybrid recall: keyword + Jaccard overlap + local char-trigram ranks, fused with RRF.
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

'''
t = t[:old_recall_start] + new_recall + t[old_recall_start + m.end():]

# Enhance compact_turns cite scrub section - find existing scrub comment
old_scrub = '''            // scrub cite hold against summary+obs
        if let Some(hold) = row.cite_hold.as_mut() {
'''
# There may be two similar blocks - enhance compact_turns one specifically
# Find in compact_turns after running_summary update
idx = t.find("/// Extractive compact over transcript turns")
if idx < 0:
    raise SystemExit("compact_turns missing")
# Within compact_turns, replace the cite scrub block if present
compact_end = t.find("\n/// Hybrid recall:", idx)
if compact_end < 0:
    compact_end = t.find("\npub fn recall_episodes", idx)
compact_fn = t[idx:compact_end]
# Insert filler scrub when merging piece into summary - look for cap_summary
if "scrub_cite_fillers" not in compact_fn:
    # replace piece join into summary
    needle = "let merged = if row.running_summary.trim().is_empty() {\n                piece.clone()\n            } else {\n                format!(\"{}\\n{}\", row.running_summary.trim(), piece)\n            };\n            row.running_summary = cap_summary(&merged);"
    repl = '''let fillers: Vec<String> = row
                .cite_hold
                .as_ref()
                .map(|h| h.dropped_filler.clone())
                .unwrap_or_default();
            let piece_s = scrub_cite_fillers(&piece, &fillers);
            let merged = if row.running_summary.trim().is_empty() {
                piece_s.clone()
            } else {
                format!(
                    "{}\\n{}",
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
            }'''
    if needle not in compact_fn:
        # try without escape differences
        print("WARN: compact merge needle missing; dump nearby")
        i2 = compact_fn.find("row.running_summary = cap_summary")
        print(repr(compact_fn[max(0,i2-200):i2+80]))
    else:
        compact_fn2 = compact_fn.replace(needle, repl, 1)
        t = t[:idx] + compact_fn2 + t[compact_end:]
        print("compact scrub enhanced")
else:
    print("compact already has scrub_cite_fillers")

# Append tests
if "mod tests" not in t:
    t += '''
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
'''
    print("tests appended")

p.write_text(t, encoding="utf-8")
print("core_memory written, len", len(t))
