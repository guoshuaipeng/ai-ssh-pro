//! OpenAI-compatible streaming chat for the Tauri build (legacy path; OpenClaw agent deferred).
use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatPayload {
    pub messages: Vec<AiChatMessage>,
    pub target_session_id: Option<String>,
    pub terminal_excerpt: Option<String>,
    pub debug_turn_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProvider {
    pub id: String,
    pub name: Option<String>,
    #[serde(rename = "baseURL")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub model_list: Option<Vec<String>>,
}

/// Matches renderer `AiProviderTestInput` / Electron `ai:provider:test` (no provider `id`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderTestInput {
    #[serde(rename = "baseURL", alias = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKey", default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
}

const AI_PROVIDER_TEST_TIMEOUT_SECS: u64 = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub providers: Vec<AiProvider>,
    pub active_provider_id: String,
    pub model: String,
    pub temperature: Option<f64>,
    pub use_open_claw: Option<bool>,
    pub ssh_parse_instructions: Option<String>,
    pub ai_max_steps: Option<u32>,
}

pub struct AiRuntime {
    abort: AtomicBool,
    assist_abort: Mutex<HashMap<String, Arc<AtomicBool>>>,
    inflight: Mutex<Option<()>>,
}

impl AiRuntime {
    pub fn new() -> Self {
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
    }

    pub async fn chat(
        &self,
        app: AppHandle,
        settings: AiSettings,
        payload: AiChatPayload,
    ) -> Result<()> {
        self.abort.store(false, Ordering::SeqCst);
        *self.inflight.lock() = Some(());

        let provider = settings
            .providers
            .iter()
            .find(|p| p.id == settings.active_provider_id)
            .or_else(|| settings.providers.first())
            .cloned()
            .ok_or_else(|| anyhow!("未找到有效的 AI Provider 配置"))?;

        let api_key = provider.api_key.trim().to_string();
        if api_key.is_empty() {
            let _ = app.emit(
                "ai:stream",
                json!({ "type": "error", "message": "请先在设置中填写 API Key" }),
            );
            return Ok(());
        }

        let base = provider.base_url.trim_end_matches('/');
        let url = format!("{base}/chat/completions");
        let temperature = settings
            .temperature
            .filter(|t| t.is_finite())
            .map(|t| t.clamp(0.0, 2.0))
            .unwrap_or(0.1);

        let mut messages = Vec::new();
        let mut system = String::from(
            "你是运维/开发助手。用简洁中文回答。若用户需要分步动作，可输出单个 JSON 对象（action/tool_call/command/end）。",
        );
        if let Some(sid) = &payload.target_session_id {
            system.push_str(&format!("\n当前关联 SSH 会话 ID：{sid}"));
        }
        if let Some(ex) = payload
            .terminal_excerpt
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            let clipped = if ex.len() > 12_000 {
                &ex[ex.len() - 12_000..]
            } else {
                ex
            };
            system.push_str("\n用户提供的终端片段：\n```\n");
            system.push_str(clipped);
            system.push_str("\n```");
        }
        messages.push(json!({ "role": "system", "content": system }));
        for m in &payload.messages {
            messages.push(json!({ "role": m.role, "content": m.content }));
        }

        let body = json!({
            "model": settings.model,
            "messages": messages,
            "stream": true,
            "temperature": temperature,
        });

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()?;

        let res = match client
            .post(&url)
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                let _ = app.emit(
                    "ai:stream",
                    json!({ "type": "error", "message": e.to_string() }),
                );
                return Ok(());
            }
        };

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let t = res.text().await.unwrap_or_default();
            let preview = if t.len() > 300 { &t[..300] } else { &t };
            let _ = app.emit(
                "ai:stream",
                json!({
                    "type": "error",
                    "message": format!("HTTP {status}: {preview}")
                }),
            );
            return Ok(());
        }

        use futures::StreamExt;
        let mut stream = res.bytes_stream();
        let mut carry = String::new();
        let mut cancelled = false;

        while let Some(item) = stream.next().await {
            if self.abort.load(Ordering::SeqCst) {
                cancelled = true;
                break;
            }
            let chunk = match item {
                Ok(c) => c,
                Err(e) => {
                    let _ = app.emit(
                        "ai:stream",
                        json!({ "type": "error", "message": e.to_string() }),
                    );
                    return Ok(());
                }
            };
            carry.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(pos) = carry.find('\n') {
                let mut line = carry[..pos].to_string();
                carry = carry[pos + 1..].to_string();
                if line.ends_with('\r') {
                    line.pop();
                }
                let s = line.trim();
                if !s.starts_with("data:") {
                    continue;
                }
                let data = s[5..].trim();
                if data == "[DONE]" {
                    let _ = app.emit("ai:stream", json!({ "type": "done" }));
                    *self.inflight.lock() = None;
                    return Ok(());
                }
                if let Ok(v) = serde_json::from_str::<Value>(data) {
                    if let Some(piece) = v
                        .pointer("/choices/0/delta/content")
                        .and_then(|x| x.as_str())
                    {
                        if !piece.is_empty() {
                            let _ = app.emit(
                                "ai:stream",
                                json!({ "type": "delta", "text": piece }),
                            );
                        }
                    }
                }
            }
        }

        if cancelled {
            let _ = app.emit(
                "ai:stream",
                json!({ "type": "cancelled", "message": "aborted" }),
            );
        } else {
            let _ = app.emit("ai:stream", json!({ "type": "done" }));
        }
        *self.inflight.lock() = None;
        Ok(())
    }

    pub async fn test_provider(&self, input: AiProviderTestInput) -> Value {
        let base = input.base_url.trim().trim_end_matches('/').to_string();
        let api_key = input.api_key.trim().to_string();
        let model = input.model.trim().to_string();

        if base.is_empty() {
            return json!({
                "ok": false,
                "status": 0,
                "reason": "baseURL",
                "messageZh": "请先填写 Base URL（通常以 /v1 或 /compatible-mode/v1 结尾）。",
                "messageEn": "Enter a Base URL first (often ends with /v1 or /compatible-mode/v1)."
            });
        }
        if !has_usable_key(&base, &api_key) {
            return json!({
                "ok": false,
                "status": 0,
                "reason": "apiKey",
                "messageZh": "请先填写 API Key，再测试连接。",
                "messageEn": "Enter an API key before testing the connection."
            });
        }
        if model.is_empty() {
            return json!({
                "ok": false,
                "status": 0,
                "reason": "model",
                "messageZh": "请先选择或填写模型名。",
                "messageEn": "Choose or enter a model name first."
            });
        }

        let url = format!("{base}/chat/completions");
        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(AI_PROVIDER_TEST_TIMEOUT_SECS))
            .build()
        {
            Ok(c) => c,
            Err(e) => return network_fail_result(&e.to_string()),
        };

        let started = std::time::Instant::now();
        let mut req = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&json!({
                "model": model,
                "messages": [{ "role": "user", "content": "ping" }],
                "max_tokens": 1,
                "stream": false,
                "temperature": 0
            }));
        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {api_key}"));
        }

        match req.send().await {
            Ok(res) => {
                let status = res.status().as_u16();
                let body = res.text().await.unwrap_or_default();
                let latency_ms = started.elapsed().as_millis() as u64;
                if (200..300).contains(&status) {
                    json!({ "ok": true, "latencyMs": latency_ms, "model": model })
                } else {
                    let (zh, en) = ai_http_error_messages(status, &body);
                    json!({
                        "ok": false,
                        "status": status,
                        "reason": "http",
                        "messageZh": zh,
                        "messageEn": en
                    })
                }
            }
            Err(e) => {
                let raw = e.to_string();
                if e.is_timeout() || raw.to_lowercase().contains("timed out") {
                    json!({
                        "ok": false,
                        "status": 0,
                        "reason": "timeout",
                        "messageZh": "连接超时。请检查 Base URL、网络或代理后重试。",
                        "messageEn": "Connection timed out. Check Base URL, network, or proxy and retry."
                    })
                } else {
                    network_fail_result(&raw)
                }
            }
        }
    }
}

fn host_of(base_url: &str) -> String {
    let s = base_url.trim();
    let rest = match s.find("://") {
        Some(i) => &s[i + 3..],
        None => s,
    };
    let hostport = rest.split('/').next().unwrap_or("");
    let hostport = match hostport.rsplit_once('@') {
        Some((_, after)) => after,
        None => hostport,
    };
    let host = if hostport.starts_with('[') {
        hostport
            .trim_start_matches('[')
            .split(']')
            .next()
            .unwrap_or("")
    } else {
        hostport.split(':').next().unwrap_or("")
    };
    host.to_lowercase()
}

fn key_optional(base_url: &str) -> bool {
    let h = host_of(base_url);
    h == "localhost" || h == "::1" || h.starts_with("127.")
}

fn has_usable_key(base_url: &str, api_key: &str) -> bool {
    !api_key.trim().is_empty() || key_optional(base_url)
}

fn network_fail_result(raw: &str) -> Value {
    let (zh, en) = ai_http_error_messages(0, raw);
    json!({
        "ok": false,
        "status": 0,
        "reason": "network",
        "messageZh": zh,
        "messageEn": en
    })
}

fn ai_http_error_messages(status: u16, body: &str) -> (String, String) {
    // Keep messages aligned with src/shared/ai-http-error.ts
    let lower = body.to_lowercase();
    let invalid_key = status == 401
        || lower.contains("invalid api key")
        || lower.contains("incorrect api key")
        || lower.contains("unauthorized")
        || lower.contains("authentication fail")
        || body.contains("密钥无效")
        || body.contains("无效的密钥")
        || body.contains("密钥错误");
    if invalid_key {
        return (
            "API Key 无效或未授权。请打开 AI 配置检查密钥是否完整、是否选对了 Provider。".into(),
            "API key is invalid or unauthorized. Open AI settings and check the key and active provider.".into(),
        );
    }
    if status == 403
        || lower.contains("forbidden")
        || lower.contains("permission denied")
        || lower.contains("access denied")
        || body.contains("没有权限")
    {
        return (
            "API 拒绝访问（403）。请确认该密钥有权调用所选模型，或账号已开通服务。".into(),
            "API forbidden (403). Confirm the key can call this model, or that the account is enabled.".into(),
        );
    }
    if status == 429
        || lower.contains("rate limit")
        || lower.contains("too many requests")
        || lower.contains("quota")
        || body.contains("限流")
        || body.contains("额度")
    {
        return (
            "请求过于频繁或额度用尽（429）。请稍后再试，或换一个 Provider / 模型。".into(),
            "Rate limited or quota exceeded (429). Retry later, or switch provider / model.".into(),
        );
    }
    if status == 404
        || lower.contains("model not found")
        || lower.contains("unknown model")
        || lower.contains("does not exist")
        || body.contains("模型不存在")
        || body.contains("模型无效")
    {
        return (
            "接口或模型不存在。请检查 Base URL（常以 /v1 或 /compatible-mode/v1 结尾）和模型名。".into(),
            "Endpoint or model not found. Check Base URL (often ends with /v1 or /compatible-mode/v1) and model name.".into(),
        );
    }
    if status == 0
        || lower.contains("econnrefused")
        || lower.contains("enotfound")
        || lower.contains("etimedout")
        || lower.contains("fetch failed")
        || lower.contains("error sending request")
        || lower.contains("dns error")
        || body.contains("无法连接")
    {
        return (
            "无法连接 AI 服务。请检查 Base URL 是否可访问，以及本机网络 / 代理。".into(),
            "Could not reach the AI provider. Check Base URL reachability and your network / proxy.".into(),
        );
    }
    if status >= 500 {
        return (
            format!("AI 服务暂时不可用（HTTP {status}）。请稍后重试。"),
            format!("AI provider is temporarily unavailable (HTTP {status}). Try again later."),
        );
    }
    let snippet: String = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let snippet: String = snippet.chars().take(100).collect();
    let code_label = if status == 0 {
        "?".to_string()
    } else {
        status.to_string()
    };
    (
        format!(
            "AI 请求失败（HTTP {code_label}）{}",
            if snippet.is_empty() {
                String::new()
            } else {
                format!("：{snippet}")
            }
        ),
        format!(
            "AI request failed (HTTP {code_label}){}",
            if snippet.is_empty() {
                String::new()
            } else {
                format!(": {snippet}")
            }
        ),
    )
}

pub type SharedAi = Arc<AiRuntime>;


pub fn extract_json_object_pub(text: &str) -> Result<Value> {
    extract_json_object(text)
}

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
            "command": str_field(o, "command", 500).replace('\r', " ").replace('\n', " "),
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
                let command = str_field(&obj, "command", 500).replace('\r', " ").replace('\n', " ");
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
    let command = str_field(o, "command", 500).replace('\r', " ").replace('\n', " ");
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
