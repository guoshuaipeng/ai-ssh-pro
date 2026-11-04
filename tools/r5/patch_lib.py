from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
lib = ROOT / "src-tauri/src/lib.rs"
t = lib.read_text(encoding="utf-8")
extra = (ROOT / "tools/r5/lib_extra.rs").read_text(encoding="utf-8")

if "mod agent;" not in t:
    t = t.replace("mod ai;\n", "mod agent;\nmod ai;\n")
for m in ("mod sync;", "mod updater;", "mod known_hosts_lookup;"):
    if m not in t:
        t = t.replace("mod store;\n", "mod store;\n" + m + "\n")

old_state = """pub struct AppState {
    pub ssh: Arc<ssh::SshManager>,
    pub local: Arc<LocalShellManager>,
    pub store: Mutex<Value>,
    pub known: Arc<KnownHostsStore>,
    pub waiters: Arc<HostKeyWaiters>,
    pub forwards: Arc<ForwardManager>,
    pub ai: ai::SharedAi,
    pub recordings: recording::SharedRecordings,
}"""
new_state = """pub struct AppState {
    pub ssh: Arc<ssh::SshManager>,
    pub local: Arc<LocalShellManager>,
    pub store: Mutex<Value>,
    pub known: Arc<KnownHostsStore>,
    pub waiters: Arc<HostKeyWaiters>,
    pub forwards: Arc<ForwardManager>,
    pub ai: ai::SharedAi,
    pub agent: agent::SharedAgent,
    pub recordings: recording::SharedRecordings,
    pub docker_watches: Mutex<std::collections::HashMap<String, Arc<std::sync::atomic::AtomicBool>>>,
}"""
if "pub agent:" not in t:
    assert old_state in t
    t = t.replace(old_state, new_state)

old_new = """            ai: Arc::new(ai::AiRuntime::new()),
            recordings,
        }
    }
}"""
new_new = """            ai: Arc::new(ai::AiRuntime::new()),
            agent: Arc::new(agent::AgentRuntime::new()),
            recordings,
            docker_watches: Mutex::new(std::collections::HashMap::new()),
        }
    }
}"""
if "agent: Arc::new" not in t:
    assert old_new in t, repr(t[t.find("ai: Arc"):t.find("ai: Arc")+200])
    t = t.replace(old_new, new_new)

old_upd = """#[tauri::command]
fn app_check_update() -> Value {
    json!({
        "ok": false,
        "deferred": true,
        "reason": "tauri-plugin-updater 需代码签名密钥与发布端点；本轮推迟，避免未签名误更与体积膨胀",
        "hasUpdate": false,
    })
}"""
new_upd = """#[tauri::command]
async fn app_check_update(opts: Option<Value>) -> Value {
    updater::check_update(opts).await
}"""
if "updater::check_update" not in t:
    assert old_upd in t
    t = t.replace(old_upd, new_upd)

old_ai = """    let chat: ai::AiChatPayload =
        serde_json::from_value(payload).map_err(|e| e.to_string())?;
    state
        .ai
        .chat(app, settings, chat)
        .await
        .map_err(|e| format!("{:#}", e))
}

#[tauri::command]
fn ai_abort_chat(state: State<'_, AppState>) -> bool {
    state.ai.abort();
    true
}"""
new_ai = """    let chat: ai::AiChatPayload =
        serde_json::from_value(payload).map_err(|e| e.to_string())?;
    if settings.use_open_claw.unwrap_or(true) {
        state
            .agent
            .run(app, state.ssh.clone(), settings, chat)
            .await
            .map_err(|e| format!("{:#}", e))
    } else {
        state
            .ai
            .chat(app, settings, chat)
            .await
            .map_err(|e| format!("{:#}", e))
    }
}

#[tauri::command]
fn ai_abort_chat(state: State<'_, AppState>) -> bool {
    state.ai.abort();
    state.agent.abort();
    true
}"""
if "state.agent" not in t or "agent.abort" not in t:
    assert old_ai in t, "ai_chat block missing"
    t = t.replace(old_ai, new_ai)

# Invalidate lookup cache on remove
old_rm = """fn known_hosts_remove(state: State<'_, AppState>, host_port: String) -> bool {
    state.known.remove_by_key(&host_port)
}"""
new_rm = """fn known_hosts_remove(state: State<'_, AppState>, host_port: String) -> bool {
    let ok = state.known.remove_by_key(&host_port);
    known_hosts_lookup::invalidate_cache();
    ok
}"""
if "invalidate_cache" not in t:
    assert old_rm in t
    t = t.replace(old_rm, new_rm)

# Insert extra commands before stub_not_implemented
if "fn docker_open_shell" not in t:
    marker = "#[tauri::command]\nfn stub_not_implemented"
    assert marker in t
    t = t.replace(marker, extra + "\n\n" + marker)

# Register in generate_handler
handlers_add = [
    "ai_resolve_confirm",
    "sftp_transfer",
    "docker_swarm_inspect",
    "docker_swarm_logs",
    "docker_swarm_action",
    "docker_watch_events",
    "docker_unwatch_events",
    "docker_open_shell",
    "known_hosts_lookup",
    "sync_get_config",
    "sync_set_config",
    "sync_test",
    "sync_push",
    "sync_pull",
    "sync_backup_local",
]
for h in handlers_add:
    if h not in t.split("generate_handler!")[1]:
        t = t.replace(
            "            stub_ok,",
            f"            {h},\n            stub_ok,",
        )

lib.write_text(t, encoding="utf-8")
print("lib.rs patched", lib.stat().st_size)

# Soften ai.rs openclaw stub status (no longer needed as primary path)
ai = (ROOT / "src-tauri/src/ai.rs").read_text(encoding="utf-8")
ai2 = ai.replace(
'''        if settings.use_open_claw.unwrap_or(true) {
            // Core-A / OpenClaw agent is not ported yet — fall through to streaming JSON chat
            // so the panel still works; emit a soft status once.
            let _ = app.emit(
                "ai:stream",
                json!({ "type": "status", "text": "OpenClaw Agent 尚未移植；使用兼容流式对话" }),
            );
        }

''',
"")
if ai2 != ai:
    (ROOT / "src-tauri/src/ai.rs").write_text(ai2, encoding="utf-8")
    print("ai.rs stub status removed")
else:
    print("ai.rs stub status already gone or mismatch")