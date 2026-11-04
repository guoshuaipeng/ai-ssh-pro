from pathlib import Path

# --- agent.rs deepen tools ---
ap = Path("src-tauri/src/agent.rs")
a = ap.read_text(encoding="utf-8")

old_tool = '''            if action == "tool_call" {
                let tool = parsed
                    .get("tool")
                    .or_else(|| parsed.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("get_terminal_snapshot");
                let _ = app.emit(
                    "ai:stream",
                    json!({ "type": "step", "structured": parsed }),
                );
                let snap = if let Some(sid) = &payload.target_session_id {
                    ssh.snapshot(sid, Some(12_000))
                        .await
                        .ok()
                        .flatten()
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                let tool_result = format!("tool={tool}\\n{}", snap.chars().rev().take(8000).collect::<String>().chars().rev().collect::<String>());
                messages.push(json!({ "role": "user", "content": format!("【工具结果】\\n{tool_result}") }));
                continue;
            }'''

new_tool = '''            if action == "tool_call" {
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
                    "content": format!("【工具结果】\\ntool={tool}\\n{tool_result}")
                }));
                continue;
            }'''

if "inventory_search" not in a:
    if old_tool not in a:
        raise SystemExit("tool_call block not found exactly")
    a = a.replace(old_tool, new_tool)

old_prompt = '''const SYSTEM_PROMPT: &str = r#"你是运维/开发助手（OpenClaw Core-A 最小路径）。每一轮只决定下一步，输出单个 JSON 对象，不要 Markdown：
{"action":"tool_call"|"command"|"end","tool":"get_terminal_snapshot"(可选),"command":"..."(action=command时),"message":"...","risk":"safe"|"caution"|"danger","completed":false}
规则：优先只读诊断；destructive 命令须标注 danger；结束时 action=end 并 completed=true。用简体中文。"#;'''

new_prompt = '''const SYSTEM_PROMPT: &str = r#"你是运维/开发助手（OpenClaw Core-A 最小闭环）。每一轮只决定下一步，输出单个 JSON 对象，不要 Markdown：
{"action":"tool_call"|"command"|"end","tool":"...","args":{...},"command":"...","message":"...","risk":"safe"|"caution"|"danger","completed":false}
可用 tool：get_terminal_snapshot；inventory_search/get/context/append_note；memory_get/context/set_goal/archive_goal（HITL 归档）。
规则：优先只读；destructive 命令须 danger；任务完成时先 memory_archive_goal 再 action=end 且 completed=true。用简体中文。"#;'''

if "inventory_search/get" not in a:
    if old_prompt not in a:
        raise SystemExit("SYSTEM_PROMPT not found")
    a = a.replace(old_prompt, new_prompt)

# Inject memory context into system prompt at start of run
if "core_memory::context_for_prompt" not in a:
    needle = '''        let mut messages: Vec<Value> = vec![json!({
            "role": "system",
            "content": SYSTEM_PROMPT
        })];'''
    repl = '''        let mem_key = payload
            .target_session_id
            .clone()
            .unwrap_or_else(|| "default".into());
        let mem_ctx = crate::core_memory::context_for_prompt(&mem_key);
        let inv_ctx = crate::inventory::format_context(None, None, None);
        let system = if mem_ctx.is_empty() && inv_ctx.is_empty() {
            SYSTEM_PROMPT.to_string()
        } else {
            format!(
                "{SYSTEM_PROMPT}\\n\\n【归档记忆】\\n{mem_ctx}\\n\\n【库存摘要】\\n{inv_ctx}"
            )
        };
        let mut messages: Vec<Value> = vec![json!({
            "role": "system",
            "content": system
        })];'''
    if needle not in a:
        raise SystemExit("messages init not found")
    a = a.replace(needle, repl)

ap.write_text(a, encoding="utf-8")
print("agent patched", ap.stat().st_size)
