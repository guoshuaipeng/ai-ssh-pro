//! Minimal OpenClaw / Core-A style step agent (not full Electron memory stack).
//! Emits ai:stream step/confirm/exec events compatible with the existing UI.
use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::ai::{extract_json_object_pub, AiChatPayload, AiSettings};
use crate::ssh::SshManager;

type ConfirmMap = Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>;

pub struct AgentRuntime {
    abort: AtomicBool,
    confirms: ConfirmMap,
}

impl AgentRuntime {
    pub fn new() -> Self {
        Self {
            abort: AtomicBool::new(false),
            confirms: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn abort(&self) {
        self.abort.store(true, Ordering::SeqCst);
        let mut map = self.confirms.lock();
        for (_, tx) in map.drain() {
            let _ = tx.send(false);
        }
    }

    pub fn resolve_confirm(&self, request_id: &str, ok: bool) -> bool {
        if let Some(tx) = self.confirms.lock().remove(request_id) {
            let _ = tx.send(ok);
            true
        } else {
            false
        }
    }

    pub async fn run(
        &self,
        app: AppHandle,
        ssh: Arc<SshManager>,
        settings: AiSettings,
        payload: AiChatPayload,
    ) -> Result<()> {
        self.abort.store(false, Ordering::SeqCst);
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
                json!({ "type": "error", "message": "请先填写 API Key（OpenClaw 风格核心会直接使用当前 Provider）。" }),
            );
            return Ok(());
        }

        let max_steps = settings
            .ai_max_steps
            .filter(|n| *n >= 1 && *n <= 30)
            .unwrap_or(10) as usize;
        let url = format!(
            "{}/chat/completions",
            provider.base_url.trim_end_matches('/')
        );
        let temperature = settings
            .temperature
            .filter(|t| t.is_finite())
            .map(|t| t.clamp(0.0, 2.0))
            .unwrap_or(0.1);

        let mut messages: Vec<Value> = vec![json!({
            "role": "system",
            "content": SYSTEM_PROMPT
        })];
        for m in &payload.messages {
            messages.push(json!({ "role": m.role, "content": m.content }));
        }
        if let Some(ex) = payload
            .terminal_excerpt
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            messages.push(json!({
                "role": "user",
                "content": format!("【当前终端摘录】\n{}", ex.chars().rev().take(6000).collect::<String>().chars().rev().collect::<String>())
            }));
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(90))
            .build()?;

        let _ = app.emit(
            "ai:stream",
            json!({ "type": "status", "text": "OpenClaw Core-A（Tauri 最小路径）运行中" }),
        );

        for step in 1..=max_steps {
            if self.abort.load(Ordering::SeqCst) {
                let _ = app.emit(
                    "ai:stream",
                    json!({ "type": "cancelled", "message": "aborted" }),
                );
                return Ok(());
            }
            let _ = app.emit(
                "ai:stream",
                json!({ "type": "progress", "step": step, "maxSteps": max_steps, "policy": "ask" }),
            );

            let body = json!({
                "model": settings.model,
                "messages": messages,
                "temperature": temperature,
                "response_format": { "type": "json_object" }
            });
            let mut res = client
                .post(&url)
                .header("Authorization", format!("Bearer {api_key}"))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?;
            if !res.status().is_success() && res.status().as_u16() == 400 {
                let mut body2 = body.clone();
                if let Some(o) = body2.as_object_mut() {
                    o.remove("response_format");
                }
                res = client
                    .post(&url)
                    .header("Authorization", format!("Bearer {api_key}"))
                    .header("Content-Type", "application/json")
                    .json(&body2)
                    .send()
                    .await?;
            }
            if !res.status().is_success() {
                let status = res.status().as_u16();
                let t = res.text().await.unwrap_or_default();
                let _ = app.emit(
                    "ai:stream",
                    json!({ "type": "error", "message": format!("HTTP {status}: {}", t.chars().take(200).collect::<String>()) }),
                );
                return Ok(());
            }
            let json_body: Value = res.json().await?;
            let content = json_body
                .pointer("/choices/0/message/content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if content.is_empty() {
                let _ = app.emit(
                    "ai:stream",
                    json!({ "type": "error", "message": "empty answer" }),
                );
                return Ok(());
            }
            let _ = app.emit("ai:stream", json!({ "type": "delta", "text": content }));
            messages.push(json!({ "role": "assistant", "content": content }));

            let parsed = match extract_json_object_pub(&content) {
                Ok(v) => v,
                Err(_) => {
                    let _ = app.emit(
                        "ai:stream",
                        json!({
                            "type": "step",
                            "structured": {
                                "action": "end",
                                "completed": true,
                                "message": content.chars().take(500).collect::<String>(),
                            }
                        }),
                    );
                    break;
                }
            };
            let action = parsed
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("end");
            if action == "end" {
                let _ = app.emit(
                    "ai:stream",
                    json!({ "type": "step", "structured": parsed }),
                );
                break;
            }

            if action == "tool_call" {
                let tool = parsed
                    .get("tool")
                    .or_else(|| parsed.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("get_terminal_snapshot");
                let args = parsed.get("args").cloned().unwrap_or(json!({}));
                let _ = app.emit(
                    "ai:stream",
                    json!({ "type": "step", "structured": parsed }),
                );
                let tool_result = match tool {
                    "get_terminal_snapshot" => {
                        let snap = if let Some(sid) = &payload.target_session_id {
                            ssh.snapshot(sid, Some(12_000))
                                .await
                                .ok()
                                .flatten()
                                .unwrap_or_default()
                        } else {
                            String::new()
                        };
                        snap.chars().rev().take(8000).collect::<String>().chars().rev().collect::<String>()
                    }
                    "inventory_search" => {
                        let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
                        crate::inventory::search(q).to_string()
                    }
                    "inventory_get" => {
                        let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        match crate::inventory::get(id) {
                            Some(h) => serde_json::to_string_pretty(&h).unwrap_or_else(|_| "{}".into()),
                            None => "null".into(),
                        }
                    }
                    "inventory_context" => {
                        let id = args.get("id").and_then(|v| v.as_str());
                        let host = args.get("host").and_then(|v| v.as_str());
                        let port = args.get("port").and_then(|v| v.as_u64()).map(|p| p as u16);
                        crate::inventory::format_context(id, host, port)
                    }
                    "inventory_append_note" => {
                        let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        let note = args.get("note").and_then(|v| v.as_str()).unwrap_or("");
                        match crate::inventory::append_note(id, note) {
                            Ok(h) => serde_json::to_string_pretty(&h).unwrap_or_else(|_| "{}".into()),
                            Err(e) => format!("error: {e}"),
                        }
                    }
                    "memory_get" => {
                        let key = args
                            .get("sessionKey")
                            .or_else(|| args.get("key"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("default");
                        crate::core_memory::as_json(key).to_string()
                    }
                    "memory_context" => {
                        let key = args
                            .get("sessionKey")
                            .or_else(|| args.get("key"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("default");
                        crate::core_memory::context_for_prompt(key)
                    }
                    "memory_set_goal" => {
                        let key = args
                            .get("sessionKey")
                            .or_else(|| args.get("key"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("default");
                        let goal = args.get("goal").and_then(|v| v.as_str()).unwrap_or("");
                        crate::core_memory::set_working_goal(key, goal);
                        "ok".into()
                    }
                    "memory_archive_goal" => {
                        let key = args
                            .get("sessionKey")
                            .or_else(|| args.get("key"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("default");
                        let goal = args
                            .get("goal")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| {
                                crate::core_memory::get_thread(key)
                                    .working_memory
                                    .map(|w| w.goal)
                                    .unwrap_or_default()
                            });
                        crate::core_memory::archive_goal(key, &goal);
                        "archived".into()
                    }
                    other => format!("unknown tool: {other}"),
                };
                messages.push(json!({
                    "role": "user",
                    "content": format!("【工具结果】\ntool={tool}\n{tool_result}")
                }));
                continue;
            }

            if action == "command" {
                let command = parsed
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .replace('\r', " ")
                    .replace('\n', " ");
                if command.is_empty() {
                    let _ = app.emit(
                        "ai:stream",
                        json!({ "type": "error", "message": "command 为空" }),
                    );
                    return Ok(());
                }
                let request_id = Uuid::new_v4().to_string();
                let (tx, rx) = oneshot::channel();
                self.confirms.lock().insert(request_id.clone(), tx);
                let _ = app.emit(
                    "ai:stream",
                    json!({
                        "type": "step",
                        "requestId": request_id,
                        "safetyMode": "agree",
                        "structured": parsed
                    }),
                );
                let approved = rx.await.unwrap_or(false);
                self.confirms.lock().remove(&request_id);
                if !approved || self.abort.load(Ordering::SeqCst) {
                    let _ = app.emit(
                        "ai:stream",
                        json!({ "type": "cancelled", "message": "user denied or aborted" }),
                    );
                    return Ok(());
                }
                let Some(sid) = payload.target_session_id.clone() else {
                    let _ = app.emit(
                        "ai:stream",
                        json!({ "type": "error", "message": "未关联 SSH 会话，无法执行命令" }),
                    );
                    return Ok(());
                };
                let exec = ssh.exec(&sid, command.clone(), Some(60_000)).await;
                match exec {
                    Ok(v) => {
                        let code = v.get("code").cloned().unwrap_or(Value::Null);
                        let stdout = v.get("stdout").and_then(|s| s.as_str()).unwrap_or("");
                        let stderr = v.get("stderr").and_then(|s| s.as_str()).unwrap_or("");
                        let _ = app.emit(
                            "ai:stream",
                            json!({
                                "type": "exec",
                                "requestId": request_id,
                                "command": command,
                                "payload": {
                                    "status": "ok",
                                    "at": chrono::Utc::now().timestamp_millis(),
                                    "code": code,
                                    "stdout": stdout.chars().take(8000).collect::<String>(),
                                    "stderr": stderr.chars().take(4000).collect::<String>(),
                                }
                            }),
                        );
                        messages.push(json!({
                            "role": "user",
                            "content": format!(
                                "【命令已执行】\n$ {command}\nexit={code}\nstdout:\n{stdout}\nstderr:\n{stderr}",
                                code = code,
                                stdout = stdout.chars().rev().take(6000).collect::<String>().chars().rev().collect::<String>(),
                                stderr = stderr.chars().rev().take(2000).collect::<String>().chars().rev().collect::<String>(),
                            )
                        }));
                    }
                    Err(e) => {
                        let _ = app.emit(
                            "ai:stream",
                            json!({
                                "type": "exec",
                                "requestId": request_id,
                                "command": command,
                                "payload": { "status": "error", "at": chrono::Utc::now().timestamp_millis(), "error": format!("{e:#}") }
                            }),
                        );
                        messages.push(json!({
                            "role": "user",
                            "content": format!("【命令失败】\n$ {command}\n{e:#}")
                        }));
                    }
                }
                continue;
            }

            let _ = app.emit(
                "ai:stream",
                json!({ "type": "step", "structured": parsed }),
            );
            break;
        }

        let _ = app.emit("ai:stream", json!({ "type": "done" }));
        Ok(())
    }
}

const SYSTEM_PROMPT: &str = r#"你是运维/开发助手（OpenClaw Core-A 最小闭环）。每一轮只决定下一步，输出单个 JSON 对象，不要 Markdown：
{"action":"tool_call"|"command"|"end","tool":"...","args":{...},"command":"...","message":"...","risk":"safe"|"caution"|"danger","completed":false}
可用 tool：get_terminal_snapshot；inventory_search/get/context/append_note；memory_get/context/set_goal/archive_goal（HITL 归档）。
规则：优先只读；destructive 命令须 danger；任务完成时先 memory_archive_goal 再 action=end 且 completed=true。用简体中文。"#;

pub type SharedAgent = Arc<AgentRuntime>;
