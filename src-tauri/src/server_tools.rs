//! Remote server toolbox (Electron shared/server-tools + server-tools-ipc).
use serde_json::{json, Value};

pub const PROCESS_LIST_CMD: &str =
    "LC_ALL=C ps -eo pid=,user=,pcpu=,pmem=,rss=,etime=,args= --sort=-pcpu 2>/dev/null | head -n 300";
pub const SERVICE_LIST_CMD: &str =
    "LC_ALL=C systemctl list-units --type=service --all --no-pager --no-legend --plain 2>&1";
pub const PORTS_CMD: &str = "LC_ALL=C ss -Htulnp 2>/dev/null || LC_ALL=C netstat -tulnp 2>/dev/null";
pub const DF_CMD: &str = "LC_ALL=C df -hP 2>/dev/null | head -n 40";
pub const RESOURCE_PROBE_CMD: &str = concat!(
    "LC_ALL=C; cat /proc/loadavg; echo '@@'; nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo; echo '@@'; ",
    "head -n1 /proc/stat; sleep 0.5; head -n1 /proc/stat; echo '@@'; free -b; echo '@@'; ",
    "df -kP -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null | head -n 30; echo '@@'; cat /proc/uptime"
);

pub fn classify_tool_error(output: &str) -> Option<&'static str> {
    let s = output.to_ascii_lowercase();
    if s.contains("a password is required") || s.contains("no tty") || s.contains("askpass") {
        Some("sudo-password")
    } else if s.contains("systemctl: command not found") || s.contains("not found") && s.contains("systemctl") {
        Some("no-systemd")
    } else if s.contains("permission denied") || s.contains("operation not permitted") {
        Some("permission")
    } else {
        None
    }
}

pub fn reason_text(kind: &str) -> String {
    match kind {
        "sudo-password" => "sudo 需要密码：请在终端里执行，或为该命令配置免密 sudo".into(),
        "no-systemd" => "该主机没有 systemd（systemctl 不可用）".into(),
        "permission" => "权限不足，可勾选“使用 sudo”后重试".into(),
        _ => "操作失败".into(),
    }
}

fn sudo_prefix(sudo: bool) -> &'static str {
    if sudo {
        "sudo -n "
    } else {
        ""
    }
}

pub fn build_kill_command(pid: u32, signal: &str, sudo: bool) -> Result<String, String> {
    if !matches!(signal, "TERM" | "KILL" | "HUP") {
        return Err("invalid-signal".into());
    }
    if pid == 0 {
        return Err("invalid-pid".into());
    }
    Ok(format!("{}kill -{signal} {pid} 2>&1", sudo_prefix(sudo)))
}

pub fn build_service_command(unit: &str, action: &str, sudo: bool) -> Result<String, String> {
    let unit = unit.trim();
    if unit.is_empty() || unit.contains('\'') || unit.contains('\n') {
        return Err("invalid-unit".into());
    }
    match action {
        "status" => Ok(format!(
            "LC_ALL=C SYSTEMD_COLORS=0 systemctl status --no-pager --lines=30 -- '{unit}' 2>&1"
        )),
        "start" | "stop" | "restart" | "reload" => Ok(format!(
            "{}systemctl {action} -- '{unit}' 2>&1",
            sudo_prefix(sudo)
        )),
        _ => Err("invalid-action".into()),
    }
}

pub fn build_log_command(source: &str, unit: Option<&str>, path: Option<&str>, lines: Option<u32>, sudo: bool) -> Result<String, String> {
    let n = lines.unwrap_or(200).clamp(10, 5000);
    let pre = sudo_prefix(sudo);
    match source {
        "journal" => Ok(format!("{pre}journalctl --no-pager -o short-iso -n {n} 2>&1")),
        "unit" => {
            let u = unit.unwrap_or("").trim();
            if u.is_empty() || u.contains('\'') {
                return Err("invalid-unit".into());
            }
            Ok(format!("{pre}journalctl --no-pager -o short-iso -n {n} -u '{u}' 2>&1"))
        }
        "file" => {
            let p = path.unwrap_or("").trim();
            if p.is_empty() || p.contains('\n') || p.contains('\'') || !p.starts_with('/') {
                return Err("invalid-path".into());
            }
            Ok(format!("{pre}tail -n {n} -- '{p}' 2>&1"))
        }
        _ => Err("invalid-source".into()),
    }
}

pub fn parse_process_list(text: &str) -> Vec<Value> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 7 {
            continue;
        }
        let pid: u64 = parts[0].parse().unwrap_or(0);
        if pid == 0 {
            continue;
        }
        let user = parts[1].to_string();
        let cpu: f64 = parts[2].parse().unwrap_or(0.0);
        let mem: f64 = parts[3].parse().unwrap_or(0.0);
        let rss: u64 = parts[4].parse().unwrap_or(0);
        let etime = parts[5].to_string();
        let command = parts[6..].join(" ");
        out.push(json!({
            "pid": pid,
            "user": user,
            "cpu": cpu,
            "mem": mem,
            "rssKb": rss,
            "etime": etime,
            "command": command,
        }));
    }
    out
}

pub fn parse_service_list(text: &str) -> Vec<Value> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.to_ascii_lowercase().contains("unit file") {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        let unit = parts[0].to_string();
        if !unit.contains('.') {
            continue;
        }
        let load = parts[1].to_string();
        let active = parts[2].to_string();
        let sub = parts[3].to_string();
        let description = if parts.len() > 4 {
            parts[4..].join(" ")
        } else {
            String::new()
        };
        out.push(json!({
            "unit": unit,
            "load": load,
            "active": active,
            "sub": sub,
            "description": description,
        }));
    }
    out
}

pub fn parse_df(text: &str) -> Vec<Value> {
    let mut out = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if i == 0 {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            continue;
        }
        let percent = parts[4].trim_end_matches('%').parse::<f64>().unwrap_or(0.0);
        out.push(json!({
            "fs": parts[0],
            "size": parts[1],
            "used": parts[2],
            "avail": parts[3],
            "percent": percent,
            "mount": parts[5..].join(" "),
        }));
    }
    out
}

pub fn parse_listen_ports(text: &str) -> Vec<Value> {
    use std::collections::HashSet;
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        let proto = parts[0].to_ascii_lowercase();
        let proto = if proto.starts_with("tcp") {
            "tcp"
        } else if proto.starts_with("udp") {
            "udp"
        } else {
            continue;
        };
        // ss: Netid State Recv-Q Send-Q Local Address:Port Peer...
        // netstat: proto Recv-Q Send-Q Local Foreign State
        let local = if parts[1].eq_ignore_ascii_case("LISTEN") || parts[1].eq_ignore_ascii_case("UNCONN") {
            parts.get(4).copied().unwrap_or("")
        } else if parts.len() >= 4 {
            parts[3]
        } else {
            continue;
        };
        let (address, port) = split_host_port(local);
        if port == 0 {
            continue;
        }
        let key = format!("{proto}|{address}|{port}");
        if !seen.insert(key) {
            continue;
        }
        let mut process = None;
        let mut pid: Option<u64> = None;
        if let Some(users) = parts.iter().find(|p| p.starts_with("users:(")) {
            if let Some(p) = users.find("pid=") {
                let rest = &users[p + 4..];
                let num: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                pid = num.parse().ok();
            }
            if let Some(start) = users.find('"') {
                if let Some(end) = users[start + 1..].find('"') {
                    process = Some(users[start + 1..start + 1 + end].to_string());
                }
            }
        }
        out.push(json!({
            "proto": proto,
            "address": address,
            "port": port,
            "process": process,
            "pid": pid,
        }));
    }
    out.sort_by(|a, b| {
        a.get("port")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            .cmp(&b.get("port").and_then(|v| v.as_u64()).unwrap_or(0))
    });
    out
}

fn split_host_port(local: &str) -> (String, u16) {
    if let Some(idx) = local.rfind(':') {
        let host = local[..idx].trim_matches(|c| c == '[' || c == ']').to_string();
        let port = local[idx + 1..].parse().unwrap_or(0);
        let host = if host.is_empty() || host == "*" {
            "0.0.0.0".into()
        } else {
            host
        };
        (host, port)
    } else {
        (local.to_string(), 0)
    }
}

/// Minimal resource parse for healthProbe (cpu/mem/disk percents).
pub fn parse_health_metrics(stdout: &str) -> Value {
    let cleaned = stdout.replace('\r', "");
    let secs: Vec<&str> = cleaned.split("@@").map(|s| s.trim()).collect();
    let mut cpu = Value::Null;
    let mut mem = Value::Null;
    let mut disk = Value::Null;
    let mut load = Value::Null;
    if let Some(la) = secs.first() {
        let nums: Vec<f64> = la
            .split_whitespace()
            .take(3)
            .filter_map(|x| x.parse().ok())
            .collect();
        if nums.len() == 3 {
            load = json!([nums[0], nums[1], nums[2]]);
        }
    }
    if secs.len() >= 3 {
        let lines: Vec<&str> = secs[2].lines().collect();
        if lines.len() >= 2 {
            if let Some(v) = cpu_from_stat(lines[0], lines[1]) {
                cpu = json!(v);
            }
        }
    }
    if let Some(free) = secs.get(3) {
        for line in free.lines() {
            if line.starts_with("Mem:") {
                let p: Vec<f64> = line.split_whitespace().skip(1).filter_map(|x| x.parse().ok()).collect();
                if p.len() >= 2 {
                    let total = p[0];
                    let used = p.get(1).copied().unwrap_or(0.0);
                    if total > 0.0 {
                        mem = json!(((used / total) * 1000.0).round() / 10.0);
                    }
                }
            }
        }
    }
    if let Some(df) = secs.get(4) {
        let mut max_pct = 0.0;
        for (i, line) in df.lines().enumerate() {
            if i == 0 {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 5 {
                let pct = parts[4].trim_end_matches('%').parse::<f64>().unwrap_or(0.0);
                if pct > max_pct {
                    max_pct = pct;
                }
            }
        }
        if max_pct > 0.0 {
            disk = json!(max_pct);
        }
    }
    json!({ "cpu": cpu, "mem": mem, "disk": disk, "load": load })
}

fn cpu_from_stat(a: &str, b: &str) -> Option<f64> {
    if !a.starts_with("cpu ") || !b.starts_with("cpu ") {
        return None;
    }
    let nums = |l: &str| -> Vec<f64> {
        l.split_whitespace()
            .skip(1)
            .filter_map(|x| x.parse().ok())
            .collect()
    };
    let x = nums(a);
    let y = nums(b);
    if x.len() < 4 || y.len() < 4 {
        return None;
    }
    let idle = |v: &[f64]| v.get(3).copied().unwrap_or(0.0) + v.get(4).copied().unwrap_or(0.0);
    let total = |v: &[f64]| v.iter().take(8).sum::<f64>();
    let dt = total(&y) - total(&x);
    let di = idle(&y) - idle(&x);
    if dt <= 0.0 {
        return Some(0.0);
    }
    Some((((dt - di) / dt) * 1000.0).round() / 10.0)
}


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
        "at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
    })
}
