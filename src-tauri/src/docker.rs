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
    msg.chars().take(800).collect()
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
            if code.unwrap_or(1) != 0 {
                return (vec![], Some(trim_err(&stdout, &stderr, code)));
            }
            let containers = parse_json_lines(&stdout)
                .iter()
                .filter_map(map_container)
                .collect();
            (containers, None)
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
        Ok((code, stdout, _stderr)) if code.unwrap_or(1) == 0 => {
            (map_compose_projects(&stdout), None)
        }
        Ok(_) | Err(_) => {
            match exec_json(ssh, session_id, "docker-compose ls --format json", Some(60_000)).await {
                Ok((code, stdout, stderr)) => {
                    if code.unwrap_or(1) != 0 {
                        (vec![], Some(trim_err(&stdout, &stderr, code)))
                    } else {
                        (map_compose_projects(&stdout), None)
                    }
                }
                Err(e) => (vec![], Some(e.to_string())),
            }
        }
    }
}

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
    let swarm = list_swarm_minimal(ssh, session_id).await;

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
