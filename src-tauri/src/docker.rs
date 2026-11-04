//! Docker management over SSH exec (Electron docker-manager MVP port).
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

use crate::ssh::SshManager;

async fn exec_json(
    ssh: &SshManager,
    session_id: &str,
    command: &str,
    timeout_ms: Option<u64>,
) -> Result<(Option<i64>, String, String)> {
    let v = ssh.exec(session_id, command.to_string(), timeout_ms).await?;
    let code = v.get("code").and_then(|c| c.as_i64()).or_else(|| {
        v.get("code")
            .and_then(|c| c.as_u64())
            .map(|u| u as i64)
    });
    let stdout = v
        .get("stdout")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let stderr = v
        .get("stderr")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    Ok((code, stdout, stderr))
}

fn trim_err(stdout: &str, stderr: &str, code: Option<i64>) -> String {
    let msg = if !stderr.trim().is_empty() {
        stderr.trim()
    } else if !stdout.trim().is_empty() {
        stdout.trim()
    } else {
        &format!("exit {}", code.unwrap_or(-1))
    };
    // Never surface raw docker --format json blobs as the user-facing error.
    let trimmed = msg.chars().take(800).collect::<String>();
    if looks_like_docker_ps_json(&trimmed) {
        return format!(
            "读取 Docker 输出失败（exit {}）",
            code.map(|c| c.to_string()).unwrap_or_else(|| "?".into())
        );
    }
    trimmed
}

/// True when stdout/stderr looks like `docker ps --format json` NDJSON, not a real error.
fn looks_like_docker_ps_json(msg: &str) -> bool {
    let t = msg.trim_start();
    t.starts_with('{')
        && (t.contains("\"ID\"") || t.contains("\"Id\""))
        && (t.contains("\"Image\"") || t.contains("\"Names\"") || t.contains("\"Command\""))
}

/// Electron sshExec uses `code ?? 0`. Missing ExitStatus (Eof race) must not be failure.
/// Explicit timeout from ssh.exec still counts as failure when there is no parseable payload.
fn exec_ok(code: Option<i64>, stderr: &str) -> bool {
    if code.is_none() && stderr.to_ascii_lowercase().contains("timeout") {
        return false;
    }
    code.unwrap_or(0) == 0
}

fn assert_safe_id(id: &str, label: &str) -> Result<String> {
    let s = id.trim();
    if !regex_safe_docker_id(s) {
        return Err(anyhow!("非法 Docker {label}"));
    }
    Ok(s.to_string())
}

fn regex_safe_docker_id(s: &str) -> bool {
    let b = s.as_bytes();
    if b.is_empty() || b.len() > 128 {
        return false;
    }
    let first = b[0];
    if !(first.is_ascii_alphanumeric()) {
        return false;
    }
    b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_' || *c == b'-' || *c == b'.')
}

fn parse_json_lines(text: &str) -> Vec<Value> {
    let mut out = Vec::new();
    for line in text.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(t) {
            out.push(v);
        }
    }
    out
}

fn parse_json_array_or_lines(text: &str) -> Vec<Value> {
    let t = text.trim();
    if t.is_empty() {
        return Vec::new();
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(t) {
        if let Some(arr) = parsed.as_array() {
            return arr.clone();
        }
        if parsed.is_object() {
            return vec![parsed];
        }
    }
    parse_json_lines(t)
}

fn short_status(state: &str, status: &str) -> String {
    let st = status.to_lowercase();
    let stt = state.to_lowercase();
    if st.contains("health: starting") || st.contains("(health: starting)") {
        return "starting".into();
    }
    if st.contains("unhealthy") {
        return "unhealthy".into();
    }
    if st.contains("healthy") {
        return "healthy".into();
    }
    if stt == "restarting" || st.contains("restarting") {
        return "starting".into();
    }
    if stt == "created" || stt == "starting" {
        return "starting".into();
    }
    if stt == "running" {
        return "running".into();
    }
    if stt == "exited" {
        return "exited".into();
    }
    if stt == "paused" {
        return "paused".into();
    }
    if !state.is_empty() {
        return state.to_string();
    }
    status.chars().take(32).collect::<String>()
}

fn parse_label_map(raw: &Value) -> HashMap<String, String> {
    let mut out = HashMap::new();
    match raw {
        Value::Object(map) => {
            for (k, v) in map {
                if let Some(s) = v.as_str() {
                    out.insert(k.clone(), s.to_string());
                }
            }
        }
        Value::String(s) if !s.trim().is_empty() => {
            for part in s.split(',') {
                if let Some(i) = part.find('=') {
                    let k = part[..i].trim();
                    let v = part[i + 1..].trim();
                    if !k.is_empty() {
                        out.insert(k.to_string(), v.to_string());
                    }
                }
            }
        }
        _ => {}
    }
    out
}

fn map_container(raw: &Value) -> Option<Value> {
    let o = raw.as_object()?;
    let id = o
        .get("ID")
        .or_else(|| o.get("Id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if id.is_empty() {
        return None;
    }
    let names_raw = o
        .get("Names")
        .or_else(|| o.get("Name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let name = {
        let cleaned = names_raw.trim_start_matches('/');
        let first = cleaned.split(',').next().unwrap_or("").trim();
        if first.is_empty() {
            id.chars().take(12).collect::<String>()
        } else {
            first.to_string()
        }
    };
    let image = o.get("Image").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let state = o.get("State").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let status = o
        .get("Status")
        .and_then(|v| v.as_str())
        .unwrap_or(state.as_str())
        .to_string();
    let ports = o.get("Ports").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let created_at = o.get("CreatedAt").and_then(|v| v.as_str()).map(|s| s.to_string());
    let labels = parse_label_map(o.get("Labels").unwrap_or(&Value::Null));
    let mut obj = json!({
        "id": id,
        "name": name,
        "image": image,
        "state": state,
        "status": status,
        "shortStatus": short_status(&state, &status),
        "ports": ports,
    });
    if let Some(ca) = created_at {
        obj.as_object_mut().unwrap().insert("createdAt".into(), json!(ca));
    }
    if let Some(p) = labels.get("com.docker.compose.project").map(|s| s.trim()).filter(|s| !s.is_empty()) {
        obj.as_object_mut().unwrap().insert("composeProject".into(), json!(p));
    }
    if let Some(p) = labels.get("com.docker.compose.service").map(|s| s.trim()).filter(|s| !s.is_empty()) {
        obj.as_object_mut().unwrap().insert("composeService".into(), json!(p));
    }
    if let Some(p) = labels.get("com.docker.swarm.service.name").map(|s| s.trim()).filter(|s| !s.is_empty()) {
        obj.as_object_mut().unwrap().insert("swarmService".into(), json!(p));
    }
    Some(obj)
}

async fn list_containers(ssh: &SshManager, session_id: &str) -> (Vec<Value>, Option<String>) {
    match exec_json(ssh, session_id, "docker ps -a --format '{{json .}}'", Some(60_000)).await {
        Ok((code, stdout, stderr)) => {
            let containers: Vec<Value> = parse_json_lines(&stdout)
                .iter()
                .filter_map(map_container)
                .collect();
            // Prefer parsed rows even when exit status was lost (code=None) or non-zero
            // with JSON still on stdout — never render raw NDJSON as containersError.
            if !containers.is_empty() || exec_ok(code, &stderr) {
                return (containers, None);
            }
            (vec![], Some(trim_err(&stdout, &stderr, code)))
        }
        Err(e) => (vec![], Some(e.to_string())),
    }
}

fn map_compose_projects(stdout: &str) -> Vec<Value> {
    parse_json_array_or_lines(stdout)
        .into_iter()
        .filter_map(|x| {
            let o = x.as_object()?;
            let name = o.get("Name").and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty())?;
            let mut proj = json!({ "name": name, "containers": [] });
            if let Some(st) = o.get("Status").and_then(|v| v.as_str()) {
                proj.as_object_mut().unwrap().insert("status".into(), json!(st));
            }
            if let Some(cf) = o.get("ConfigFiles").and_then(|v| v.as_str()) {
                proj.as_object_mut().unwrap().insert("configFiles".into(), json!(cf));
            }
            Some(proj)
        })
        .collect()
}

async fn list_compose_projects(ssh: &SshManager, session_id: &str) -> (Vec<Value>, Option<String>) {
    match exec_json(ssh, session_id, "docker compose ls --format json", Some(60_000)).await {
        Ok((code, stdout, stderr)) => {
            let projects = map_compose_projects(&stdout);
            if !projects.is_empty() || exec_ok(code, &stderr) {
                return (projects, None);
            }
            // fall through to docker-compose binary
        }
        Err(_) => {}
    }
    match exec_json(ssh, session_id, "docker-compose ls --format json", Some(60_000)).await {
        Ok((code, stdout, stderr)) => {
            let projects = map_compose_projects(&stdout);
            if !projects.is_empty() || exec_ok(code, &stderr) {
                (projects, None)
            } else {
                (vec![], Some(trim_err(&stdout, &stderr, code)))
            }
        }
        Err(e) => (vec![], Some(e.to_string())),
    }
}

#[allow(dead_code)]
async fn list_swarm_minimal(ssh: &SshManager, session_id: &str) -> Value {
    // Lightweight: detect swarm; full service tree deferred if inspect fails.
    match exec_json(ssh, session_id, "docker info --format '{{json .Swarm}}'", Some(30_000)).await {
        Ok((code, stdout, _)) if code.unwrap_or(1) == 0 => {
            if let Ok(swarm) = serde_json::from_str::<Value>(stdout.trim()) {
                let local = swarm.get("LocalNodeState").and_then(|v| v.as_str()).unwrap_or("");
                let active = local.eq_ignore_ascii_case("active");
                let control = swarm
                    .get("ControlAvailable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                return json!({
                    "active": active,
                    "manager": control,
                    "stacks": [],
                });
            }
        }
        _ => {}
    }
    json!({ "active": false, "manager": false, "stacks": [] })
}

pub async fn list_tree(ssh: &SshManager, session_id: &str) -> Result<Value> {
    let (containers_all, containers_error) = list_containers(ssh, session_id).await;
    let (mut projects, compose_error) = list_compose_projects(ssh, session_id).await;
    let swarm = list_swarm_services(ssh, session_id).await;

    let mut by_project: HashMap<String, Vec<Value>> = HashMap::new();
    let mut standalone: Vec<Value> = Vec::new();

    for c in containers_all {
        let proj = c
            .get("composeProject")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        if let Some(p) = proj {
            by_project.entry(p).or_default().push(c);
        } else {
            standalone.push(c);
        }
    }

    let mut known: HashSet<String> = projects
        .iter()
        .filter_map(|p| p.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();
    for name in by_project.keys() {
        if !known.contains(name) {
            projects.push(json!({ "name": name, "containers": [] }));
            known.insert(name.clone());
        }
    }
    for project in &mut projects {
        let name = project
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let list = by_project.remove(&name).unwrap_or_default();
        project
            .as_object_mut()
            .unwrap()
            .insert("containers".into(), json!(list));
    }
    projects.sort_by(|a, b| {
        let an = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let bn = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        an.cmp(bn)
    });
    standalone.sort_by(|a, b| {
        let an = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let bn = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        an.cmp(bn)
    });

    let mut out = json!({
        "containers": standalone,
        "composeProjects": projects,
        "swarm": swarm,
    });
    if let Some(e) = containers_error {
        out.as_object_mut()
            .unwrap()
            .insert("containersError".into(), json!(e));
    }
    if let Some(e) = compose_error {
        out.as_object_mut()
            .unwrap()
            .insert("composeError".into(), json!(e));
    }
    Ok(out)
}

pub async fn container_action(
    ssh: &SshManager,
    session_id: &str,
    container_id: &str,
    action: &str,
) -> Result<()> {
    let id = assert_safe_id(container_id, "容器")?;
    let (code, stdout, stderr) = exec_json(
        ssh,
        session_id,
        &format!(
            "docker inspect --format '{{{{index .Config.Labels \"com.docker.swarm.service.name\"}}}}' {id}"
        ),
        Some(30_000),
    )
    .await?;
    let swarm_service = stdout.trim().to_string();
    if regex_safe_docker_id(&swarm_service) && !swarm_service.is_empty() {
        if action == "restart" {
            let (c, so, se) = exec_json(
                ssh,
                session_id,
                &format!("docker service update --force {swarm_service}"),
                Some(120_000),
            )
            .await?;
            if c.unwrap_or(1) != 0 {
                return Err(anyhow!(trim_err(&so, &se, c)));
            }
            return Ok(());
        }
        if matches!(action, "start" | "stop" | "rm") {
            return Err(anyhow!(
                "「{id}」属于 Swarm 服务「{swarm_service}」。请勿直接 {action} 任务容器。"
            ));
        }
    }
    let cmd = match action {
        "start" => format!("docker start {id}"),
        "stop" => format!("docker stop {id}"),
        "restart" => format!("docker restart {id}"),
        "rm" => format!("docker rm -f {id}"),
        _ => return Err(anyhow!("不支持的容器操作: {action}")),
    };
    let (c, so, se) = exec_json(ssh, session_id, &cmd, Some(120_000)).await?;
    if c.unwrap_or(1) != 0 {
        return Err(anyhow!(trim_err(&so, &se, c)));
    }
    let _ = code;
    let _ = stderr;
    Ok(())
}

pub async fn container_logs(
    ssh: &SshManager,
    session_id: &str,
    container_id: &str,
    tail: Option<u32>,
) -> Result<String> {
    let id = assert_safe_id(container_id, "容器")?;
    let n = tail.unwrap_or(200).clamp(20, 2000);
    let (c, stdout, stderr) = exec_json(
        ssh,
        session_id,
        &format!("docker logs --tail {n} {id} 2>&1"),
        Some(60_000),
    )
    .await?;
    if c.unwrap_or(1) != 0 && stdout.trim().is_empty() {
        return Err(anyhow!(trim_err(&stdout, &stderr, c)));
    }
    let text = if !stdout.is_empty() { stdout } else { stderr };
    if text.len() > 200_000 {
        Ok(text[text.len() - 200_000..].to_string())
    } else {
        Ok(text)
    }
}

pub async fn inspect_container(
    ssh: &SshManager,
    session_id: &str,
    container_id: &str,
) -> Result<Value> {
    let id = assert_safe_id(container_id, "容器")?;
    let (c, stdout, stderr) = exec_json(
        ssh,
        session_id,
        &format!("docker inspect --format '{{{{json .}}}}' {id}"),
        Some(60_000),
    )
    .await?;
    if c.unwrap_or(1) != 0 {
        return Err(anyhow!(trim_err(&stdout, &stderr, c)));
    }
    let parsed: Value = serde_json::from_str(stdout.trim())
        .map_err(|_| anyhow!("无法解析 docker inspect 输出"))?;
    let root = if let Some(arr) = parsed.as_array() {
        arr.first().cloned().unwrap_or(Value::Null)
    } else {
        parsed
    };
    let config = root.get("Config").cloned().unwrap_or(Value::Null);
    let host_config = root.get("HostConfig").cloned().unwrap_or(Value::Null);
    let state = root.get("State").cloned().unwrap_or(Value::Null);
    let network_settings = root.get("NetworkSettings").cloned().unwrap_or(Value::Null);
    let health = state.get("Health").cloned().unwrap_or(Value::Null);
    let labels = parse_label_map(config.get("Labels").unwrap_or(&Value::Null));
    let env: Vec<Value> = config
        .get("Env")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.as_str())
                .map(|entry| {
                    if let Some(i) = entry.find('=') {
                        json!({ "key": &entry[..i], "value": &entry[i+1..] })
                    } else {
                        json!({ "key": entry, "value": "" })
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let mut ports = Vec::new();
    if let Some(port_map) = network_settings.get("Ports").and_then(|v| v.as_object()) {
        for (container, bindings) in port_map {
            if let Some(arr) = bindings.as_array() {
                if arr.is_empty() {
                    ports.push(json!({ "container": container }));
                } else {
                    for b in arr {
                        ports.push(json!({
                            "container": container,
                            "hostIp": b.get("HostIp").and_then(|v| v.as_str()).unwrap_or(""),
                            "hostPort": b.get("HostPort").and_then(|v| v.as_str()).unwrap_or(""),
                        }));
                    }
                }
            } else {
                ports.push(json!({ "container": container }));
            }
        }
    }
    let mounts: Vec<Value> = root
        .get("Mounts")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|m| {
                    json!({
                        "type": m.get("Type").and_then(|v| v.as_str()).unwrap_or(""),
                        "source": m.get("Source").and_then(|v| v.as_str()).unwrap_or(""),
                        "destination": m.get("Destination").and_then(|v| v.as_str()).unwrap_or(""),
                        "mode": m.get("Mode").and_then(|v| v.as_str()).unwrap_or(""),
                        "rw": m.get("RW").and_then(|v| v.as_bool()).unwrap_or(true),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let networks: Vec<Value> = network_settings
        .get("Networks")
        .and_then(|v| v.as_object())
        .map(|map| {
            map.iter()
                .map(|(name, n)| {
                    json!({
                        "name": name,
                        "networkId": n.get("NetworkID").and_then(|v| v.as_str()).unwrap_or(""),
                        "ipAddress": n.get("IPAddress").and_then(|v| v.as_str()).unwrap_or(""),
                        "gateway": n.get("Gateway").and_then(|v| v.as_str()).unwrap_or(""),
                        "macAddress": n.get("MacAddress").and_then(|v| v.as_str()).unwrap_or(""),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let label_list: Vec<Value> = labels
        .iter()
        .map(|(k, v)| json!({ "key": k, "value": v }))
        .collect();
    let name = root
        .get("Name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_start_matches('/')
        .to_string();
    let cmd = {
        let entry = config
            .get("Entrypoint")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str())
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();
        let args = config
            .get("Cmd")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str())
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();
        format!("{entry} {args}").trim().to_string()
    };
    let restart = host_config
        .get("RestartPolicy")
        .and_then(|v| v.get("Name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(json!({
        "id": root.get("Id").and_then(|v| v.as_str()).unwrap_or(&id),
        "name": if name.is_empty() { id.clone() } else { name },
        "image": config.get("Image").and_then(|v| v.as_str()).unwrap_or(""),
        "command": cmd,
        "workingDir": config.get("WorkingDir").and_then(|v| v.as_str()).filter(|s| !s.is_empty()),
        "user": config.get("User").and_then(|v| v.as_str()).filter(|s| !s.is_empty()),
        "restartPolicy": restart,
        "createdAt": root.get("Created").and_then(|v| v.as_str()),
        "startedAt": state.get("StartedAt").and_then(|v| v.as_str()),
        "finishedAt": state.get("FinishedAt").and_then(|v| v.as_str()),
        "exitCode": state.get("ExitCode").and_then(|v| v.as_i64()),
        "health": health.get("Status").and_then(|v| v.as_str()),
        "env": env,
        "ports": ports,
        "mounts": mounts,
        "networks": networks,
        "labels": label_list,
    }))
}

pub async fn compose_ps(ssh: &SshManager, session_id: &str, project: &str) -> Result<Value> {
    let name = assert_safe_id(project, "compose 项目名")?;
    let (c, stdout, stderr) = exec_json(
        ssh,
        session_id,
        &format!("docker compose -p {name} ps -a --format '{{{{json .}}}}'"),
        Some(60_000),
    )
    .await?;
    if c.unwrap_or(1) != 0 {
        return Ok(json!({ "services": [], "error": trim_err(&stdout, &stderr, c) }));
    }
    let services: Vec<Value> = parse_json_lines(&stdout)
        .into_iter()
        .filter_map(|x| {
            let o = x.as_object()?;
            let svc = o
                .get("Service")
                .or_else(|| o.get("Name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    o.get("Names")
                        .and_then(|v| v.as_str())
                        .map(|s| s.trim_start_matches('/').split(',').next().unwrap_or("").to_string())
                })
                .unwrap_or_default();
            let id = o
                .get("ID")
                .or_else(|| o.get("Id"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let state = o
                .get("State")
                .or_else(|| o.get("Status"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let status = o
                .get("Status")
                .and_then(|v| v.as_str())
                .unwrap_or(state.as_str())
                .to_string();
            if svc.is_empty() && id.is_none() {
                return None;
            }
            Some(json!({
                "name": if svc.is_empty() { id.clone().unwrap_or_else(|| "?".into()) } else { svc },
                "id": id,
                "state": state,
                "status": status,
                "shortStatus": short_status(&state, &status),
            }))
        })
        .collect();
    Ok(json!({ "services": services }))
}

pub async fn compose_action(
    ssh: &SshManager,
    session_id: &str,
    project: &str,
    action: &str,
) -> Result<()> {
    let name = assert_safe_id(project, "compose 项目名")?;
    let cmd = match action {
        "up" => format!("docker compose -p {name} up -d"),
        "down" => format!("docker compose -p {name} down"),
        "restart" => format!("docker compose -p {name} restart"),
        "pull" => format!("docker compose -p {name} pull"),
        _ => return Err(anyhow!("不支持的 compose 操作: {action}")),
    };
    let (c, so, se) = exec_json(ssh, session_id, &cmd, Some(300_000)).await?;
    if c.unwrap_or(1) != 0 {
        return Err(anyhow!(trim_err(&so, &se, c)));
    }
    Ok(())
}


fn parse_replicas(replicas: &str) -> (u32, u32) {
    let re = replicas.trim();
    if let Some((a, b)) = re.split_once('/') {
        let running = a.trim().parse().unwrap_or(0);
        let desired = b.trim().parse().unwrap_or(0);
        (running, desired)
    } else {
        (0, 0)
    }
}

fn swarm_short_status(running: u32, desired: u32, update_state: &str) -> String {
    let us = update_state.to_lowercase();
    if us == "updating" || us == "rollback_started" {
        return "starting".into();
    }
    if desired == 0 {
        return "exited".into();
    }
    if running == 0 {
        return "exited".into();
    }
    if running < desired {
        return "starting".into();
    }
    "running".into()
}

fn map_swarm_ports(raw: &Value) -> Vec<Value> {
    let mut out = Vec::new();
    let Some(arr) = raw.as_array() else {
        return out;
    };
    for item in arr {
        let target = item.get("TargetPort").and_then(|v| v.as_u64());
        let Some(target) = target else { continue };
        out.push(json!({
            "targetPort": target,
            "publishedPort": item.get("PublishedPort").and_then(|v| v.as_u64()),
            "protocol": item.get("Protocol").and_then(|v| v.as_str()).unwrap_or("tcp"),
            "publishMode": item.get("PublishMode").and_then(|v| v.as_str()).unwrap_or("ingress"),
        }));
    }
    out
}

pub async fn list_swarm_services(ssh: &SshManager, session_id: &str) -> Value {
    let (code, stdout, _) = match exec_json(
        ssh,
        session_id,
        "docker info --format '{{json .Swarm}}'",
        Some(30_000),
    )
    .await
    {
        Ok(v) => v,
        Err(e) => {
            return json!({ "active": false, "manager": false, "stacks": [], "error": e.to_string() });
        }
    };
    if code.unwrap_or(1) != 0 {
        return json!({ "active": false, "manager": false, "stacks": [] });
    }
    let swarm: Value = serde_json::from_str(stdout.trim()).unwrap_or(Value::Null);
    let local = swarm
        .get("LocalNodeState")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let active = local.eq_ignore_ascii_case("active");
    let control = swarm
        .get("ControlAvailable")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !active {
        return json!({ "active": false, "manager": false, "stacks": [] });
    }
    if !control {
        return json!({
            "active": true,
            "manager": false,
            "stacks": [],
            "error": "本节点是 Swarm worker，只有 manager 节点可以查看服务配置"
        });
    }
    let (ls_code, ls_out, ls_err) = match exec_json(
        ssh,
        session_id,
        "docker service ls --format '{{json .}}'",
        Some(60_000),
    )
    .await
    {
        Ok(v) => v,
        Err(e) => {
            return json!({ "active": true, "manager": true, "stacks": [], "error": e.to_string() });
        }
    };
    if ls_code.unwrap_or(1) != 0 {
        return json!({
            "active": true,
            "manager": true,
            "stacks": [],
            "error": trim_err(&ls_out, &ls_err, ls_code)
        });
    }
    let (_, insp_out, _) = exec_json(
        ssh,
        session_id,
        "ids=$(docker service ls -q); if [ -n \"$ids\" ]; then docker service inspect $ids --format '{{json .}}'; fi",
        Some(120_000),
    )
    .await
    .unwrap_or((Some(0), String::new(), String::new()));
    let mut detail_by_id: HashMap<String, Value> = HashMap::new();
    for item in parse_json_lines(&insp_out) {
        if let Some(id) = item.get("ID").and_then(|v| v.as_str()) {
            detail_by_id.insert(id.to_string(), item);
        }
    }
    let mut services = Vec::new();
    for item in parse_json_lines(&ls_out) {
        let id = item.get("ID").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if id.is_empty() || name.is_empty() {
            continue;
        }
        let replicas = item.get("Replicas").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let (running, desired) = parse_replicas(&replicas);
        let detail = detail_by_id.get(&id);
        let spec = detail
            .and_then(|d| d.get("Spec"))
            .cloned()
            .unwrap_or(Value::Null);
        let labels = parse_label_map(spec.get("Labels").unwrap_or(&Value::Null));
        let endpoint = detail
            .and_then(|d| d.get("Endpoint"))
            .cloned()
            .unwrap_or(Value::Null);
        let ports = map_swarm_ports(endpoint.get("Ports").unwrap_or(&Value::Null));
        let update_state = detail
            .and_then(|d| d.pointer("/UpdateStatus/State"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let stack = labels
            .get("com.docker.stack.namespace")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let mut svc = json!({
            "id": id,
            "name": name,
            "image": item.get("Image").and_then(|v| v.as_str()).unwrap_or(""),
            "mode": item.get("Mode").and_then(|v| v.as_str()).unwrap_or("replicated"),
            "replicas": replicas,
            "runningTasks": running,
            "desiredTasks": desired,
            "shortStatus": swarm_short_status(running, desired, update_state),
            "ports": ports,
            "containers": [],
        });
        if let Some(s) = stack {
            svc.as_object_mut().unwrap().insert("stack".into(), json!(s));
        }
        services.push(svc);
    }
    let mut by_stack: HashMap<String, Vec<Value>> = HashMap::new();
    for svc in services {
        let key = svc
            .get("stack")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        by_stack.entry(key).or_default().push(svc);
    }
    let mut stacks: Vec<Value> = by_stack
        .into_iter()
        .map(|(name, mut list)| {
            list.sort_by(|a, b| {
                a.get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .cmp(b.get("name").and_then(|v| v.as_str()).unwrap_or(""))
            });
            json!({ "name": name, "services": list })
        })
        .collect();
    stacks.sort_by(|a, b| {
        let an = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let bn = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        match (an.is_empty(), bn.is_empty()) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => an.cmp(bn),
        }
    });
    json!({ "active": true, "manager": true, "stacks": stacks })
}

pub async fn swarm_inspect(ssh: &SshManager, session_id: &str, service: &str) -> Result<Value> {
    let name = assert_safe_id(service, "Swarm 服务")?;
    let (c, stdout, stderr) = exec_json(
        ssh,
        session_id,
        &format!("docker service inspect {name} --format '{{{{json .}}}}'"),
        Some(60_000),
    )
    .await?;
    if c.unwrap_or(1) != 0 {
        return Err(anyhow!(trim_err(&stdout, &stderr, c)));
    }
    let (pc, ps_out, _) = exec_json(
        ssh,
        session_id,
        &format!("docker service ps {name} --no-trunc --format '{{{{json .}}}}'"),
        Some(60_000),
    )
    .await?;
    let _ = pc;
    let parsed: Value = serde_json::from_str(stdout.trim())
        .map_err(|_| anyhow!("无法解析 docker service inspect 输出"))?;
    let root = if let Some(arr) = parsed.as_array() {
        arr.first().cloned().unwrap_or(Value::Null)
    } else {
        parsed
    };
    let spec = root.get("Spec").cloned().unwrap_or(Value::Null);
    let task_template = spec.get("TaskTemplate").cloned().unwrap_or(Value::Null);
    let container_spec = task_template
        .get("ContainerSpec")
        .cloned()
        .unwrap_or(Value::Null);
    let mode = spec.get("Mode").cloned().unwrap_or(Value::Null);
    let desired = mode
        .pointer("/Replicated/Replicas")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let is_global = mode.get("Global").is_some();
    let tasks: Vec<Value> = parse_json_lines(&ps_out)
        .into_iter()
        .filter_map(|x| {
            let id = x.get("ID").and_then(|v| v.as_str())?;
            Some(json!({
                "id": id,
                "name": x.get("Name").and_then(|v| v.as_str()).unwrap_or(""),
                "image": x.get("Image").and_then(|v| v.as_str()).unwrap_or(""),
                "node": x.get("Node").and_then(|v| v.as_str()).unwrap_or(""),
                "desiredState": x.get("DesiredState").and_then(|v| v.as_str()).unwrap_or(""),
                "currentState": x.get("CurrentState").and_then(|v| v.as_str()).unwrap_or(""),
                "error": x.get("Error").and_then(|v| v.as_str()).unwrap_or(""),
            }))
        })
        .take(30)
        .collect();
    let running = tasks
        .iter()
        .filter(|t| {
            t.get("desiredState").and_then(|v| v.as_str()) == Some("Running")
                && t
                    .get("currentState")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_lowercase().starts_with("running"))
                    .unwrap_or(false)
        })
        .count();
    let labels = parse_label_map(spec.get("Labels").unwrap_or(&Value::Null));
    let stack = labels
        .get("com.docker.stack.namespace")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let env: Vec<Value> = container_spec
        .get("Env")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.as_str())
                .map(|entry| {
                    if let Some(i) = entry.find('=') {
                        json!({ "key": &entry[..i], "value": &entry[i + 1..] })
                    } else {
                        json!({ "key": entry, "value": "" })
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let ports = map_swarm_ports(
        root
            .pointer("/Endpoint/Ports")
            .or_else(|| spec.pointer("/EndpointSpec/Ports"))
            .unwrap_or(&Value::Null),
    );
    let replicas = if is_global {
        format!("{running}/{}", tasks.iter().filter(|t| t.get("desiredState").and_then(|v| v.as_str()) == Some("Running")).count())
    } else {
        format!("{running}/{desired}")
    };
    let mut out = json!({
        "id": root.get("ID").and_then(|v| v.as_str()).unwrap_or(&name),
        "name": spec.get("Name").and_then(|v| v.as_str()).unwrap_or(&name),
        "image": container_spec.get("Image").and_then(|v| v.as_str()).unwrap_or(""),
        "mode": if is_global { "global" } else { "replicated" },
        "replicas": replicas,
        "createdAt": root.get("CreatedAt").and_then(|v| v.as_str()),
        "updatedAt": root.get("UpdatedAt").and_then(|v| v.as_str()),
        "ports": ports,
        "env": env,
        "labels": labels.iter().map(|(k,v)| json!({"key": k, "value": v})).collect::<Vec<_>>(),
        "tasks": tasks,
    });
    if let Some(s) = stack {
        out.as_object_mut().unwrap().insert("stack".into(), json!(s));
    }
    Ok(out)
}

pub async fn swarm_logs(
    ssh: &SshManager,
    session_id: &str,
    service: &str,
    tail: Option<u32>,
) -> Result<String> {
    let name = assert_safe_id(service, "Swarm 服务")?;
    let n = tail.unwrap_or(200).clamp(20, 2000);
    let (c, stdout, stderr) = exec_json(
        ssh,
        session_id,
        &format!("docker service logs --tail {n} {name} 2>&1"),
        Some(60_000),
    )
    .await?;
    if c.unwrap_or(1) != 0 && stdout.trim().is_empty() {
        return Err(anyhow!(trim_err(&stdout, &stderr, c)));
    }
    let text = if !stdout.is_empty() { stdout } else { stderr };
    if text.len() > 200_000 {
        Ok(text[text.len() - 200_000..].to_string())
    } else {
        Ok(text)
    }
}

pub async fn swarm_action(
    ssh: &SshManager,
    session_id: &str,
    service: &str,
    action: &str,
    replicas: Option<u32>,
) -> Result<()> {
    let name = assert_safe_id(service, "Swarm 服务")?;
    if action == "restart" {
        let (c, so, se) = exec_json(
            ssh,
            session_id,
            &format!("docker service update --force {name}"),
            Some(180_000),
        )
        .await?;
        if c.unwrap_or(1) != 0 {
            return Err(anyhow!(trim_err(&so, &se, c)));
        }
        return Ok(());
    }
    if action == "scale" {
        let n = replicas.ok_or_else(|| anyhow!("副本数需为 0–512 的整数"))?;
        if n > 512 {
            return Err(anyhow!("副本数需为 0–512 的整数"));
        }
        let (c, so, se) = exec_json(
            ssh,
            session_id,
            &format!("docker service scale {name}={n}"),
            Some(120_000),
        )
        .await?;
        if c.unwrap_or(1) != 0 {
            return Err(anyhow!(trim_err(&so, &se, c)));
        }
        return Ok(());
    }
    Err(anyhow!("不支持的 Swarm 操作: {action}"))
}


#[cfg(test)]
mod docker_list_tests {
    use super::*;

    #[test]
    fn exec_ok_treats_missing_code_as_success_like_electron() {
        assert!(exec_ok(None, ""));
        assert!(exec_ok(Some(0), ""));
        assert!(!exec_ok(Some(1), "permission denied"));
        assert!(!exec_ok(None, "partial\ntimeout"));
    }

    #[test]
    fn trim_err_does_not_echo_docker_ps_json() {
        let json = r#"{"Command":"/bin/sh","CreatedAt":"2026-11-02","ID":"98f1ed8995fe","Image":"snowy-zhqhmobile-app:eb89","Names":"snowy-zhqhmobile-app.1"}"#;
        let msg = trim_err(json, "", None);
        assert!(!msg.contains("98f1ed8995fe"), "raw json leaked: {msg}");
        assert!(msg.contains("读取 Docker"));
    }

    #[test]
    fn parse_json_lines_maps_swarm_container() {
        let line = r#"{"Command":"\"/bin/sh\"","CreatedAt":"2026-11-02 11:12:28 +0800 CST","ID":"98f1ed8995fe","Image":"snowy-zhqhmobile-app:eb89bb02-5487","Labels":"com.docker.swarm.service.name=snowy-zhqhmobile-app,image.vendor=Anolis OS","Names":"snowy-zhqhmobile-app.1.hvvige809","Ports":"","State":"running","Status":"Up 2 hours"}"#;
        let rows = parse_json_lines(line);
        assert_eq!(rows.len(), 1);
        let c = map_container(&rows[0]).expect("map");
        assert_eq!(c.get("id").and_then(|v| v.as_str()), Some("98f1ed8995fe"));
        assert_eq!(
            c.get("swarmService").and_then(|v| v.as_str()),
            Some("snowy-zhqhmobile-app")
        );
    }

    #[test]
    fn missing_exit_with_json_stdout_still_lists_containers() {
        let stdout = r#"{"ID":"abc123def456","Names":"web","Image":"nginx","State":"running","Status":"Up 1s","Ports":"80/tcp","Labels":""}"#;
        let code: Option<i64> = None;
        let stderr = "";
        let containers: Vec<Value> = parse_json_lines(stdout)
            .iter()
            .filter_map(map_container)
            .collect();
        assert_eq!(containers.len(), 1);
        assert!(!containers.is_empty() || exec_ok(code, stderr));
    }
}
