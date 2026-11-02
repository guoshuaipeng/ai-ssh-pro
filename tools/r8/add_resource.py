from pathlib import Path

# --- Append full resource snapshot parse to server_tools.rs ---
st = Path("src-tauri/src/server_tools.rs")
text = st.read_text(encoding="utf-8")
if "parse_resource_snapshot" not in text:
    text += r'''

/// Full resource snapshot (Electron shared/resource-monitor.parseResourceSnapshot).
pub fn parse_resource_snapshot(stdout: &str) -> Value {
    let cleaned = stdout.replace('\r', "");
    let secs: Vec<&str> = cleaned.split("@@").map(|s| s.trim()).collect();
    let mut load = Value::Null;
    let mut cores = Value::Null;
    let mut cpu_percent = Value::Null;
    let mut mem = Value::Null;
    let mut swap = Value::Null;
    let mut disks: Vec<Value> = Vec::new();
    let mut uptime_sec = Value::Null;

    if let Some(la) = secs.first() {
        let nums: Vec<f64> = la.split_whitespace().take(3).filter_map(|x| x.parse().ok()).collect();
        if nums.len() == 3 {
            load = json!([nums[0], nums[1], nums[2]]);
        }
    }
    if let Some(c) = secs.get(1).and_then(|s| s.lines().next()).and_then(|s| s.trim().parse::<i64>().ok()) {
        if c > 0 {
            cores = json!(c);
        }
    }
    if let Some(stat) = secs.get(2) {
        let lines: Vec<&str> = stat.lines().filter(|l| l.starts_with("cpu")).collect();
        if lines.len() >= 2 {
            if let Some(v) = cpu_from_stat(lines[0], lines[1]) {
                cpu_percent = json!(v);
            }
        }
    }
    if let Some(free) = secs.get(3) {
        for line in free.lines() {
            let p: Vec<&str> = line.trim().split_whitespace().collect();
            if p.first() == Some(&"Mem:") && p.len() >= 4 {
                let total: f64 = p[1].parse().unwrap_or(0.0);
                let available: f64 = if p.len() >= 7 {
                    p[6].parse().unwrap_or(0.0)
                } else {
                    total - p[2].parse().unwrap_or(0.0)
                };
                let used = total - available;
                if total > 0.0 {
                    mem = json!({
                        "total": total,
                        "used": used,
                        "available": available,
                        "percent": ((used / total) * 1000.0).round() / 10.0
                    });
                }
            } else if p.first() == Some(&"Swap:") && p.len() >= 3 {
                let total: f64 = p[1].parse().unwrap_or(0.0);
                let used: f64 = p[2].parse().unwrap_or(0.0);
                swap = json!({
                    "total": total,
                    "used": used,
                    "percent": if total > 0.0 { ((used / total) * 1000.0).round() / 10.0 } else { 0.0 }
                });
            }
        }
    }
    if let Some(df) = secs.get(4) {
        for (i, line) in df.lines().enumerate() {
            if i == 0 { continue; }
            let p: Vec<&str> = line.trim().split_whitespace().collect();
            if p.len() < 6 { continue; }
            let total_kb: f64 = p[1].parse().unwrap_or(0.0);
            let used_kb: f64 = p[2].parse().unwrap_or(0.0);
            if total_kb <= 0.0 { continue; }
            let percent = p[4].trim_end_matches('%').parse::<f64>().unwrap_or_else(|_| {
                ((used_kb / total_kb) * 1000.0).round() / 10.0
            });
            disks.push(json!({
                "fs": p[0],
                "mount": p[5..].join(" "),
                "totalKb": total_kb,
                "usedKb": used_kb,
                "percent": percent,
            }));
        }
    }
    if let Some(up) = secs.get(5).and_then(|s| s.split_whitespace().next()).and_then(|s| s.parse::<f64>().ok()) {
        uptime_sec = json!(up.floor() as i64);
    }
    json!({
        "load": load,
        "cores": cores,
        "cpuPercent": cpu_percent,
        "mem": mem,
        "swap": swap,
        "disks": disks,
        "uptimeSec": uptime_sec,
        "at": chrono::Utc::now().timestamp_millis(),
    })
}
'''
    st.write_text(text, encoding="utf-8")
    print("server_tools resource snapshot added")
else:
    print("resource snapshot already present")
