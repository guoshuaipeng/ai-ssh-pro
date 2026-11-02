from pathlib import Path
p = Path("src-tauri/src/ssh.rs")
t = p.read_text(encoding="utf-8")
old = """            if prefer_resume && resume_from > 1 {
                let mut slots = self.jump_slots.lock();
                if let Some(slot) = slots.remove(&slot_key) {
                    let need = (resume_from as usize).saturating_sub(1);
                    if slot.handles.len() >= need && need > 0 {
                        let kept: Vec<_> = slot.handles.into_iter().take(need).collect();
                        // Drop unused remainder by disconnect
                        jump_handles.extend(kept.iter().cloned());
                        start_idx = need;
                        // Last kept handle becomes current for forwarding
                        // We'll take ownership by cloning Arc and locking below
                        let last = kept.last().cloned();
                        drop(slots);
                        if let Some(last) = last {
                            // forward from last kept hop toward next hop / target
                            let next_host = if start_idx < hops.len() {
                                hops[start_idx].host.clone()
                            } else {
                                opts.host.clone()
                            };
                            let next_port = if start_idx < hops.len() {
                                hops[start_idx].port.unwrap_or(22)
                            } else {
                                port
                            };
                            match last.lock().await.channel_open_direct_tcpip(
                                next_host.clone(),
                                next_port as u32,
                                "127.0.0.1".to_string(),
                                0,
                            ).await {
                                Ok(channel) => {
                                    let stream = channel.into_stream();
                                    let is_target = start_idx >= hops.len();
                                    let hop_agent = if is_target {
                                        target_agent_sock.clone()
                                    } else {
                                        None
                                    };
                                    let handler = self.make_handler(
                                        &app,
                                        &next_host,
                                        next_port,
                                        hop_agent,
                                    );
                                    match client::connect_stream(config.clone(), stream, handler).await {
                                        Ok(h) => cur_opt = Some(h),
                                        Err(_) => {
                                            start_idx = 0;
                                            jump_handles.clear();
                                            self.drop_jump_slot(&slot_key);
                                        }
                                    }
                                }
                                Err(_) => {
                                    start_idx = 0;
                                    jump_handles.clear();
                                }
                            }
                        }
                    }
                }
            }"""

new = """            if prefer_resume && resume_from > 1 {
                let slot = self.jump_slots.lock().remove(&slot_key);
                if let Some(slot) = slot {
                    let need = (resume_from as usize).saturating_sub(1);
                    if slot.handles.len() >= need && need > 0 {
                        let kept: Vec<_> = slot.handles.into_iter().take(need).collect();
                        jump_handles.extend(kept.iter().cloned());
                        start_idx = need;
                        let last = kept.last().cloned();
                        if let Some(last) = last {
                            let next_host = if start_idx < hops.len() {
                                hops[start_idx].host.clone()
                            } else {
                                opts.host.clone()
                            };
                            let next_port = if start_idx < hops.len() {
                                hops[start_idx].port.unwrap_or(22)
                            } else {
                                port
                            };
                            match last
                                .lock()
                                .await
                                .channel_open_direct_tcpip(
                                    next_host.clone(),
                                    next_port as u32,
                                    "127.0.0.1".to_string(),
                                    0,
                                )
                                .await
                            {
                                Ok(channel) => {
                                    let stream = channel.into_stream();
                                    let is_target = start_idx >= hops.len();
                                    let hop_agent = if is_target {
                                        target_agent_sock.clone()
                                    } else {
                                        None
                                    };
                                    let handler =
                                        self.make_handler(&app, &next_host, next_port, hop_agent);
                                    match client::connect_stream(config.clone(), stream, handler)
                                        .await
                                    {
                                        Ok(h) => cur_opt = Some(h),
                                        Err(_) => {
                                            start_idx = 0;
                                            jump_handles.clear();
                                        }
                                    }
                                }
                                Err(_) => {
                                    start_idx = 0;
                                    jump_handles.clear();
                                }
                            }
                        }
                    }
                }
            }"""

if old not in t:
    raise SystemExit("resume block not found for Send fix")
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("fixed Send")
