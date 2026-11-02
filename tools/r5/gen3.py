from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- Append swarm APIs to docker.rs and replace list_swarm_minimal usage ---
docker = (ROOT / "src-tauri/src/docker.rs").read_text(encoding="utf-8")

# Replace list_swarm_minimal call in list_tree
if "list_swarm_services(" not in docker:
    docker = docker.replace(
        "let swarm = list_swarm_minimal(ssh, session_id).await;",
        "let swarm = list_swarm_services(ssh, session_id).await;",
    )

swarm_extra = r'''

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
'''

if "pub async fn swarm_inspect" not in docker:
    # keep list_swarm_minimal for now or leave it
    docker = docker + swarm_extra
    (ROOT / "src-tauri/src/docker.rs").write_text(docker, encoding="utf-8")
    print("docker swarm appended", len(swarm_extra))
else:
    print("swarm already present")

# Fix list_tree if replace didn't happen due to formatting
docker = (ROOT / "src-tauri/src/docker.rs").read_text(encoding="utf-8")
if "list_swarm_minimal(ssh, session_id).await" in docker:
    docker = docker.replace(
        "list_swarm_minimal(ssh, session_id).await",
        "list_swarm_services(ssh, session_id).await",
    )
    (ROOT / "src-tauri/src/docker.rs").write_text(docker, encoding="utf-8")
    print("list_tree uses full swarm")
elif "list_swarm_services(ssh, session_id).await" in docker:
    print("list_tree already full swarm")
else:
    print("WARN list_tree swarm call not found")