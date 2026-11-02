//! OpenAI-compatible streaming chat for the Tauri build (legacy path; OpenClaw agent deferred).
use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub providers: Vec<AiProvider>,
    pub active_provider_id: String,
    pub model: String,
    pub temperature: Option<f64>,
    pub use_open_claw: Option<bool>,
}

pub struct AiRuntime {
    abort: AtomicBool,
    inflight: Mutex<Option<()>>,
}

impl AiRuntime {
    pub fn new() -> Self {
        Self {
            abort: AtomicBool::new(false),
            inflight: Mutex::new(None),
        }
    }

    pub fn abort(&self) {
        self.abort.store(true, Ordering::SeqCst);
    }

    pub async fn chat(
        &self,
        app: AppHandle,
        settings: AiSettings,
        payload: AiChatPayload,
    ) -> Result<()> {
        if settings.use_open_claw.unwrap_or(true) {
            // Core-A / OpenClaw agent is not ported yet — fall through to streaming JSON chat
            // so the panel still works; emit a soft status once.
            let _ = app.emit(
                "ai:stream",
                json!({ "type": "status", "text": "OpenClaw Agent 尚未移植；使用兼容流式对话" }),
            );
        }

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

    pub async fn test_provider(&self, provider: AiProvider) -> Value {
        let api_key = provider.api_key.trim().to_string();
        if api_key.is_empty() {
            return json!({ "ok": false, "error": "missing apiKey" });
        }
        let base = provider.base_url.trim_end_matches('/');
        let url = format!("{base}/models");
        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
        {
            Ok(c) => c,
            Err(e) => return json!({ "ok": false, "error": e.to_string() }),
        };
        match client
            .get(&url)
            .header("Authorization", format!("Bearer {api_key}"))
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => json!({ "ok": true }),
            Ok(res) => {
                // fallback: try a tiny chat completion
                let status = res.status().as_u16();
                let chat_url = format!("{base}/chat/completions");
                let model = provider
                    .model_list
                    .as_ref()
                    .and_then(|m| m.first())
                    .cloned()
                    .unwrap_or_else(|| "gpt-4o-mini".into());
                match client
                    .post(&chat_url)
                    .header("Authorization", format!("Bearer {api_key}"))
                    .json(&json!({
                        "model": model,
                        "messages": [{ "role": "user", "content": "ping" }],
                        "max_tokens": 1,
                        "stream": false
                    }))
                    .send()
                    .await
                {
                    Ok(r) if r.status().is_success() => json!({ "ok": true }),
                    Ok(r) => json!({ "ok": false, "error": format!("HTTP {}", r.status()) }),
                    Err(e) => json!({ "ok": false, "error": format!("models HTTP {status}; chat: {e}") }),
                }
            }
            Err(e) => json!({ "ok": false, "error": e.to_string() }),
        }
    }
}

pub type SharedAi = Arc<AiRuntime>;
