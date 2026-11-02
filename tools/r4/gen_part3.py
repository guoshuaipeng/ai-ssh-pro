from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- patch recording.rs: add OnceLock global ---
rec = (ROOT / "src-tauri/src/recording.rs").read_text(encoding="utf-8")
if "OnceLock" not in rec:
    rec = rec.replace(
        "use std::sync::Arc;",
        "use std::sync::{Arc, OnceLock};",
    )
    rec = rec.replace(
        "pub type SharedRecordings = Arc<RecordingRegistry>;",
        '''pub type SharedRecordings = Arc<RecordingRegistry>;

static GLOBAL: OnceLock<SharedRecordings> = OnceLock::new();

pub fn set_global(reg: SharedRecordings) {
    let _ = GLOBAL.set(reg);
}

pub fn global() -> Option<SharedRecordings> {
    GLOBAL.get().cloned()
}

pub fn append_global(session_id: &str, chunk: &str) {
    if let Some(r) = GLOBAL.get() {
        r.append(session_id, chunk);
    }
}
''',
    )
    (ROOT / "src-tauri/src/recording.rs").write_text(rec, encoding="utf-8")
    print("recording global ok")

# --- append assist/parse to ai.rs ---
ai = (ROOT / "src-tauri/src/ai.rs").read_text(encoding="utf-8")
if "ssh_parse_instructions" not in ai:
    ai = ai.replace(
        '''    pub temperature: Option<f64>,
    pub use_open_claw: Option<bool>,
}''',
        '''    pub temperature: Option<f64>,
    pub use_open_claw: Option<bool>,
    pub ssh_parse_instructions: Option<String>,
}''',
    )

if "pub async fn assist" not in ai:
    ai = ai.replace(
        "pub struct AiRuntime {\n    abort: AtomicBool,\n    inflight: Mutex<Option<()>>,\n}",
        '''pub struct AiRuntime {
    abort: AtomicBool,
    assist_abort: Mutex<HashMap<String, Arc<AtomicBool>>>,
    inflight: Mutex<Option<()>>,
}''',
    )
    if "use std::collections::HashMap" not in ai:
        ai = ai.replace(
            "use std::sync::atomic::{AtomicBool, Ordering};",
            "use std::collections::HashMap;\nuse std::sync::atomic::{AtomicBool, Ordering};",
        )
    ai = ai.replace(
        '''    pub fn new() -> Self {
        Self {
            abort: AtomicBool::new(false),
            inflight: Mutex::new(None),
        }
    }

    pub fn abort(&self) {
        self.abort.store(true, Ordering::SeqCst);
    }''',
        '''    pub fn new() -> Self {
        Self {
            abort: AtomicBool::new(false),
            assist_abort: Mutex::new(HashMap::new()),
            inflight: Mutex::new(None),
        }
    }

    pub fn abort(&self) {
        self.abort.store(true, Ordering::SeqCst);
    }

    pub fn abort_assist(&self, request_id: &str) {
        if let Some(f) = self.assist_abort.lock().get(request_id) {
            f.store(true, Ordering::SeqCst);
        }
    }''',
    )
    ai += r'''

fn extract_json_object(text: &str) -> Result<Value> {
    let t = text.trim();
    let body = if let Some(cap) = {
        let re_start = t.find("```");
        if let Some(s) = re_start {
            let after = &t[s + 3..];
            let after = after.strip_prefix("json").unwrap_or(after);
            let after = after.strip_prefix('\n').unwrap_or(after);
            if let Some(e) = after.find("```") {
                Some(after[..e].trim().to_string())
            } else {
                None
            }
        } else {
            None
        }
    } {
        cap
    } else {
        t.to_string()
    };
    let start = body.find('{').ok_or_else(|| anyhow!("not an object"))?;
    let end = body.rfind('}').ok_or_else(|| anyhow!("not an object"))?;
    if end <= start {
        return Err(anyhow!("not an object"));
    }
    let raw: Value = serde_json::from_str(&body[start..=end])?;
    if !raw.is_object() {
        return Err(anyhow!("not an object"));
    }
    Ok(raw)
}

fn str_field(o: &Value, k: &str, max: usize) -> String {
    o.get(k)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().chars().take(max).collect())
        .unwrap_or_default()
}

fn normalize_assist(kind: &str, o: &Value) -> Value {
    if kind == "explainSelection" {
        let summary = str_field(o, "summary", 2000);
        if summary.is_empty() && str_field(o, "command", 500).is_empty() {
            return json!({ "ok": false, "code": "error", "message": "empty answer" });
        }
        return json!({
            "ok": true,
            "kind": kind,
            "summary": summary,
            "command": str_field(o, "command", 500).replace(['\r', '\n'], " "),
            "riskLevel": o.get("riskLevel").or_else(|| o.get("risk")).cloned().unwrap_or(json!("caution")),
            "notes": str_field(o, "notes", 1000),
        });
    }
    if kind == "explainError" || kind == "explainAlert" {
        let fixes: Vec<Value> = o
            .get("fixes")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|f| {
                let obj = if f.is_object() {
                    f
                } else {
                    json!({ "command": f })
                };
                let command = str_field(&obj, "command", 500).replace(['\r', '\n'], " ");
                if command.is_empty() {
                    None
                } else {
                    let mut row = json!({ "command": command });
                    let note = str_field(&obj, "note", 300);
                    if !note.is_empty() {
                        row.as_object_mut().unwrap().insert("note".into(), json!(note));
                    }
                    Some(row)
                }
            })
            .take(5)
            .collect();
        let cause = str_field(o, "cause", 2000);
        if cause.is_empty() && fixes.is_empty() {
            return json!({ "ok": false, "code": "error", "message": "empty answer" });
        }
        let mut out = json!({ "ok": true, "kind": kind, "cause": cause, "fixes": fixes });
        let notes = str_field(o, "notes", 1000);
        if !notes.is_empty() {
            out.as_object_mut().unwrap().insert("notes".into(), json!(notes));
        }
        return out;
    }
    let command = str_field(o, "command", 500).replace(['\r', '\n'], " ");
    if command.is_empty() {
        return json!({ "ok": false, "code": "error", "message": "empty answer" });
    }
    let risk = match o.get("risk").and_then(|v| v.as_str()) {
        Some("danger") => "danger",
        Some("safe") => "safe",
        _ => "caution",
    };
    json!({
        "ok": true,
        "kind": kind,
        "command": command,
        "explanation": str_field(o, "explanation", 600),
        "risk": risk,
    })
}

fn assist_system_prompt(kind: &str, locale: Option<&str>) -> String {
    let lang = if locale.unwrap_or("").starts_with("en") {
        "Reply in English."
    } else {
        "用简体中文回答。"
    };
    if kind == "explainSelection" {
        return format!(
            "You are a senior Linux / DevOps engineer. Explain the selected terminal text briefly and suggest one safe follow-up command if useful. Reply with ONE JSON object only: {{\"summary\": string, \"command\": string, \"riskLevel\": \"safe\"|\"caution\"|\"danger\", \"notes\": string}}.\n{lang}"
        );
    }
    if kind == "explainError" || kind == "explainAlert" {
        return format!(
            "You are a senior Linux / DevOps engineer explaining one host alert or terminal error. Reply with ONE JSON object only: {{\"cause\": string, \"fixes\": [{{\"command\": string, \"note\": string}}], \"notes\": string}}.\n{lang}"
        );
    }
    format!(
        "You turn a natural-language request into ONE POSIX shell command. Reply with ONE JSON object only: {{\"command\": string, \"explanation\": string, \"risk\": \"safe\"|\"caution\"|\"danger\"}}.\n{lang}"
    )
}

impl AiRuntime {
    pub async fn assist(&self, settings: AiSettings, req: Value) -> Value {
        let kind = req
            .get("kind")
            .and_then(|v| v.as_str())
            .unwrap_or("suggestCommand")
            .to_string();
        let request_id = req
            .get("requestId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let text = req
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return json!({ "ok": false, "code": "error", "message": "empty input" });
        }
        let provider = settings
            .providers
            .iter()
            .find(|p| p.id == settings.active_provider_id)
            .or_else(|| settings.providers.first())
            .cloned();
        let Some(provider) = provider else {
            return json!({ "ok": false, "code": "not-configured" });
        };
        let api_key = provider.api_key.trim().to_string();
        if api_key.is_empty() || provider.base_url.trim().is_empty() || settings.model.trim().is_empty()
        {
            return json!({ "ok": false, "code": "not-configured" });
        }
        let flag = Arc::new(AtomicBool::new(false));
        if !request_id.is_empty() {
            self.assist_abort
                .lock()
                .insert(request_id.clone(), flag.clone());
        }
        let host = req.get("host").and_then(|v| v.as_str()).unwrap_or("");
        let user = if kind == "explainSelection" {
            format!(
                "{}Selected text:\n{}",
                if host.is_empty() {
                    String::new()
                } else {
                    format!("Host: {host}\n")
                },
                text.chars().rev().take(6000).collect::<String>().chars().rev().collect::<String>()
            )
        } else if kind == "explainError" || kind == "explainAlert" {
            format!(
                "{}{} (most recent last):\n{}",
                if host.is_empty() {
                    String::new()
                } else {
                    format!("Host: {host}\n")
                },
                if kind == "explainAlert" {
                    "Alert context"
                } else {
                    "Terminal output"
                },
                text.chars().rev().take(6000).collect::<String>().chars().rev().collect::<String>()
            )
        } else {
            format!(
                "{}Request: {}",
                if host.is_empty() {
                    String::new()
                } else {
                    format!("Host: {host}\n")
                },
                text.chars().take(1000).collect::<String>()
            )
        };
        let url = format!(
            "{}/chat/completions",
            provider.base_url.trim_end_matches('/')
        );
        let body = json!({
            "model": settings.model,
            "messages": [
                { "role": "system", "content": assist_system_prompt(&kind, None) },
                { "role": "user", "content": user }
            ],
            "temperature": 0.1,
            "response_format": { "type": "json_object" }
        });
        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
        {
            Ok(c) => c,
            Err(e) => return json!({ "ok": false, "code": "error", "message": e.to_string() }),
        };
        let send = |body: Value| {
            let client = client.clone();
            let url = url.clone();
            let api_key = api_key.clone();
            async move {
                client
                    .post(&url)
                    .header("Authorization", format!("Bearer {api_key}"))
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await
            }
        };
        let mut res = match send(body.clone()).await {
            Ok(r) => r,
            Err(e) => {
                if flag.load(Ordering::SeqCst) {
                    return json!({ "ok": false, "code": "aborted" });
                }
                return json!({ "ok": false, "code": "error", "message": e.to_string() });
            }
        };
        if !res.status().is_success() && res.status().as_u16() == 400 {
            let mut body2 = body.clone();
            if let Some(obj) = body2.as_object_mut() {
                obj.remove("response_format");
            }
            match send(body2).await {
                Ok(r) => res = r,
                Err(e) => return json!({ "ok": false, "code": "error", "message": e.to_string() }),
            }
        }
        if flag.load(Ordering::SeqCst) {
            return json!({ "ok": false, "code": "aborted" });
        }
        if !res.status().is_success() {
            let status = res.status().as_u16();
            let t = res.text().await.unwrap_or_default();
            return json!({ "ok": false, "code": "error", "message": format!("HTTP {status}: {}", t.chars().take(200).collect::<String>()) });
        }
        let json_body: Value = match res.json().await {
            Ok(v) => v,
            Err(e) => return json!({ "ok": false, "code": "error", "message": e.to_string() }),
        };
        let content = json_body
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if content.is_empty() {
            return json!({ "ok": false, "code": "error", "message": "empty answer" });
        }
        match extract_json_object(content) {
            Ok(obj) => normalize_assist(&kind, &obj),
            Err(e) => json!({ "ok": false, "code": "error", "message": e.to_string() }),
        }
    }

    pub async fn parse_ssh(&self, settings: AiSettings, raw_text: String) -> Result<Value> {
        let trimmed = raw_text.trim().to_string();
        if trimmed.is_empty() {
            return Err(anyhow!("请先粘贴需要解析的文字"));
        }
        let provider = settings
            .providers
            .iter()
            .find(|p| p.id == settings.active_provider_id)
            .or_else(|| settings.providers.first())
            .cloned()
            .ok_or_else(|| anyhow!("未找到有效的 AI Provider 配置"))?;
        let api_key = provider.api_key.trim().to_string();
        if api_key.is_empty() {
            return Err(anyhow!("请先在「AI 设置」中填写 API Key"));
        }
        let mut system = String::from(
            "你是 SSH 连接信息解析器。用户会粘贴一段任意文本（可能含 IP、域名、端口、用户名、密码、私钥路径、会话备注、表格或运维工单片段）。\n规则：\n1) 只提取文本中明确出现的信息，禁止编造主机或凭据。\n2) 端口缺省时不要猜，可省略 port 键。\n3) 输出必须是单个 JSON 对象，不要 Markdown 代码块，不要其它说明文字。\n4) 允许的键（均为可选）：label, host, port, username, password, privateKeyPath, passphrase, notes。\n5) port 必须是数字。notes 可简短列出未映射进其它字段的提示。",
        );
        if let Some(custom) = settings
            .ssh_parse_instructions
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            system.push_str("\n\n【用户自定义拆分规则】\n");
            system.push_str(custom);
        }
        let url = format!(
            "{}/chat/completions",
            provider.base_url.trim_end_matches('/')
        );
        let mut body = json!({
            "model": settings.model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": trimmed.chars().take(12000).collect::<String>() }
            ],
            "temperature": 0.1,
            "response_format": { "type": "json_object" }
        });
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()?;
        let mut res = client
            .post(&url)
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        if !res.status().is_success() && res.status().as_u16() == 400 {
            if let Some(obj) = body.as_object_mut() {
                obj.remove("response_format");
            }
            res = client
                .post(&url)
                .header("Authorization", format!("Bearer {api_key}"))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?;
        }
        if !res.status().is_success() {
            let status = res.status().as_u16();
            let t = res.text().await.unwrap_or_default();
            return Err(anyhow!("解析请求失败：HTTP {status} {}", t.chars().take(200).collect::<String>()));
        }
        let json_body: Value = res.json().await?;
        let content = json_body
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("模型未返回有效内容"))?;
        let parsed = extract_json_object(content)?;
        let o = parsed.as_object().cloned().unwrap_or_default();
        let mut out = serde_json::Map::new();
        for k in [
            "label",
            "host",
            "username",
            "password",
            "privateKeyPath",
            "passphrase",
            "notes",
        ] {
            if let Some(Value::String(s)) = o.get(k) {
                let t = s.trim();
                if !t.is_empty() {
                    out.insert(k.to_string(), json!(t));
                }
            }
        }
        if let Some(p) = o.get("port") {
            if let Some(n) = p.as_u64() {
                out.insert("port".into(), json!(n));
            } else if let Some(s) = p.as_str() {
                if let Ok(n) = s.trim().parse::<u64>() {
                    out.insert("port".into(), json!(n));
                }
            }
        }
        Ok(Value::Object(out))
    }
}
'''
    (ROOT / "src-tauri/src/ai.rs").write_text(ai, encoding="utf-8")
    print("ai assist/parse appended", (ROOT/"src-tauri/src/ai.rs").stat().st_size)
else:
    print("ai already has assist")

# Fix assist string replace for newlines - Rust doesn't have replace with array like that in older editions - use replace twice
ai = (ROOT / "src-tauri/src/ai.rs").read_text(encoding="utf-8")
ai = ai.replace(".replace(['\\r', '\\n'], \" \")", ".replace('\\r', \" \").replace('\\n', \" \")")
# also the unicode escapes in the file from python - check
ai = ai.replace('.replace([\'\\r\', \'\\n\'], " ")', '.replace(\'\\r\', " ").replace(\'\\n\', " ")')
(ROOT / "src-tauri/src/ai.rs").write_text(ai, encoding="utf-8")
print("ai newline replace fixed")