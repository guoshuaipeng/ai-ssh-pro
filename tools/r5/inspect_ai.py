from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
lib = ROOT / "src-tauri/src/lib.rs"
t = lib.read_text(encoding="utf-8")

# mods
if "mod agent;" not in t:
    t = t.replace("mod ai;\n", "mod agent;\nmod ai;\n")
if "mod sync;" not in t:
    t = t.replace("mod store;\n", "mod store;\nmod sync;\nmod updater;\nmod known_hosts_lookup;\n")

# AppState fields
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
    if old_state not in t:
        raise SystemExit("AppState not found")
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
    if old_new not in t:
        raise SystemExit("AppState::new not found")
    t = t.replace(old_new, new_new)

# Replace app_check_update
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
    if old_upd not in t:
        raise SystemExit("app_check_update not found")
    t = t.replace(old_upd, new_upd)

# Patch ai_chat to route OpenClaw
old_ai = """#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    payload: Value,
) -> Result<(), String> {
    let settings_val = {
        let store = state.store.lock();
        store.get("ai").cloned().unwrap_or(json!({
            "providers": [],
            "activeProviderId": "",
            "model": "",
            "temperature": 0.1
        }))
    };
    let settings: ai::AiSettings =
        serde_json::from_value(settings_val).map_err(|e| e.to_string())?;
    let chat: ai::AiChatPayload =
        serde_json::from_value(payload).map_err(|e| e.to_string())?;"""

# Need to see what follows
idx = t.find(old_ai)
if idx < 0:
    raise SystemExit("ai_chat header not found")
# find the rest until closing of function - look for state.ai.chat
rest_start = idx + len(old_ai)
# Find ".chat(" after this
chat_call = t.find("state.ai.chat", rest_start)
if chat_call < 0:
    raise SystemExit("ai.chat call not found")
# get from chat_call back a bit to see full body
print("ai_chat region:")
print(t[idx:chat_call+200])
