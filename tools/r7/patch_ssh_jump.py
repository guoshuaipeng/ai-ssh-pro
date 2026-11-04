from pathlib import Path

p = Path("src-tauri/src/ssh.rs")
t = p.read_text(encoding="utf-8")

# Options fields
if "resume_from_hop" not in t:
    t = t.replace(
        """    /// Used by probeJump (milliseconds).
    pub timeout_ms: Option<u64>,
}""",
        """    /// Used by probeJump (milliseconds).
    pub timeout_ms: Option<u64>,
    /// 1-based hop index to resume from after a prior mid-chain failure (Electron resumeFromHop).
    pub resume_from_hop: Option<u32>,
    /// When false, do not park/reuse jump slots (default true).
    pub jump_retry_from_failed_hop: Option<bool>,
}""",
    )

# JumpSlot + manager field
if "jump_slots:" not in t:
    t = t.replace(
        """pub struct SshManager {
    sessions: AsyncMutex<HashMap<String, Arc<LiveSession>>>,
    known: Arc<KnownHostsStore>,
    waiters: Arc<HostKeyWaiters>,
    forwards: Arc<ForwardManager>,
    remote_routes: Arc<RemoteForwardRouter>,
}""",
        """struct JumpSlot {
    handles: Vec<Arc<AsyncMutex<Handle<ClientHandler>>>>,
    at: i64,
}

pub struct SshManager {
    sessions: AsyncMutex<HashMap<String, Arc<LiveSession>>>,
    known: Arc<KnownHostsStore>,
    waiters: Arc<HostKeyWaiters>,
    forwards: Arc<ForwardManager>,
    remote_routes: Arc<RemoteForwardRouter>,
    /// Successful jump hop handles parked after a later hop failed (Electron jumpSlots).
    jump_slots: Mutex<HashMap<String, JumpSlot>>,
}""",
    )
    t = t.replace(
        """        Self {
            sessions: AsyncMutex::new(HashMap::new()),
            known,
            waiters,
            forwards,
            remote_routes,
        }""",
        """        Self {
            sessions: AsyncMutex::new(HashMap::new()),
            known,
            waiters,
            forwards,
            remote_routes,
            jump_slots: Mutex::new(HashMap::new()),
        }""",
    )

# Helpers after resolve_hops
if "fn jump_slot_key" not in t:
    t = t.replace(
        """        Vec::new()
    }


    pub fn default_agent_socket""",
        """        Vec::new()
    }

    fn jump_slot_key(opts: &SshConnectOptions, port: u16) -> String {
        let hops = Self::resolve_hops(opts);
        let chain = hops
            .iter()
            .map(|h| format!("{}@{}:{}", h.username, h.host, h.port.unwrap_or(22)))
            .collect::<Vec<_>>()
            .join("|");
        format!("{chain}>{}@{}:{port}", opts.username, opts.host.trim())
    }

    fn drop_jump_slot(&self, key: &str) {
        if let Some(slot) = self.jump_slots.lock().remove(key) {
            // Handles drop when Arc refcount hits 0; disconnect best-effort.
            for h in slot.handles {
                let h = h.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = h.lock().await.disconnect(Disconnect::ByApplication, "", "").await;
                });
            }
        }
    }

    fn format_hop_failure(hop: u32, total: u32, name: &str, addr: &str, reason: &str) -> String {
        format!("[hop {hop}/{total}] {name} ({addr}): {reason}")
    }

    pub fn default_agent_socket""",
    )

# Replace entire jump else-branch with resume-aware version
old_else_start = """        } else {
            // Connect hop0 via TCP, then tunnel each next hop / final target via direct-tcpip.
            let mut chain: Vec<(String, u16, String, Option<String>, Option<String>, Option<String>, Option<String>)> =
                Vec::new();
"""

if "prefer_resume" not in t and old_else_start in t:
    # Find end of else block: "            handle = cur;\n        }\n\n        let handle = Arc::new"
    end_marker = "            handle = cur;\n        }\n\n        let handle = Arc::new(AsyncMutex::new(handle));"
    start = t.find(old_else_start)
    end = t.find(end_marker)
    if start < 0 or end < 0:
        raise SystemExit(f"jump else bounds missing start={start} end={end}")
    end = end + len("            handle = cur;\n        }")
    new_else = r'''
        } else {
            // ProxyJump with optional resume-from-failed-hop (Electron jumpSlots).
            let prefer_resume = opts.jump_retry_from_failed_hop.unwrap_or(true);
            let slot_key = Self::jump_slot_key(&opts, port);
            let hop_total = hops.len() as u32;
            let resume_from = opts.resume_from_hop.unwrap_or(0);

            if resume_from == 0 {
                self.drop_jump_slot(&slot_key);
            }

            let mut start_idx: usize = 0;
            let mut cur_opt: Option<Handle<ClientHandler>> = None;

            if prefer_resume && resume_from > 1 {
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
            }

            // Build remaining chain from start_idx: remaining hops + target
            let mut chain: Vec<(String, u16, String, Option<String>, Option<String>, Option<String>, Option<String>, bool)> =
                Vec::new();
            for (i, h) in hops.iter().enumerate() {
                if i < start_idx {
                    continue;
                }
                chain.push((
                    h.host.clone(),
                    h.port.unwrap_or(22),
                    h.username.clone(),
                    h.password.clone(),
                    h.private_key_path.clone(),
                    h.passphrase.clone(),
                    h.auth.clone(),
                    false,
                ));
            }
            chain.push((
                opts.host.clone(),
                port,
                opts.username.clone(),
                opts.password.clone(),
                opts.private_key_path.clone(),
                opts.passphrase.clone(),
                opts.auth_mode.clone(),
                true,
            ));

            // If resume already opened the first remaining hop into cur_opt, auth it then continue
            let mut chain_iter = chain.into_iter().enumerate();
            let mut cur: Handle<ClientHandler>;

            if let Some(mut existing) = cur_opt.take() {
                let Some((ci, (nh, np, nu, npw, npk, npp, nam, is_target))) = chain_iter.next() else {
                    return Err(anyhow!("resume chain empty"));
                };
                let hop_no = if is_target { hop_total.saturating_add(1) } else { (start_idx + ci + 1) as u32 };
                let name = if is_target {
                    opts.host.clone()
                } else {
                    hops.get(start_idx + ci)
                        .and_then(|h| h.label.clone())
                        .unwrap_or_else(|| nh.clone())
                };
                let _ = app.emit(
                    "ssh:hop",
                    json!({ "hop": hop_no.min(hop_total.max(1)), "total": hop_total.max(1), "name": name, "phase": "resume" }),
                );
                if let Err(e) = Self::authenticate_handle(
                    &mut existing,
                    &nu,
                    npw.as_deref(),
                    npk.as_deref(),
                    npp.as_deref(),
                    nam.as_deref(),
                    if is_target { opts.agent_socket.as_deref() } else { None },
                )
                .await
                {
                    // failed the resumed hop — keep prior jump_handles parked
                    if prefer_resume && !jump_handles.is_empty() {
                        self.jump_slots.lock().insert(
                            slot_key.clone(),
                            JumpSlot {
                                handles: jump_handles.clone(),
                                at: chrono::Utc::now().timestamp_millis(),
                            },
                        );
                    }
                    let reason = format!("{e:#}");
                    return Err(anyhow!(Self::format_hop_failure(
                        hop_no.min(hop_total.max(1)),
                        hop_total.max(1),
                        &name,
                        &format!("{nh}:{np}"),
                        &reason,
                    )));
                }
                cur = existing;
                // continue with rest below using same loop pattern
                for (ci, (nh, np, nu, npw, npk, npp, nam, is_target)) in chain_iter {
                    let hop_idx_display = if is_target {
                        hop_total
                    } else {
                        (start_idx + ci + 1) as u32
                    };
                    let name = if is_target {
                        opts.label.clone().unwrap_or_else(|| opts.host.clone())
                    } else {
                        hops.get(start_idx + ci)
                            .and_then(|h| h.label.clone())
                            .unwrap_or_else(|| nh.clone())
                    };
                    if !is_target {
                        let _ = app.emit(
                            "ssh:hop",
                            json!({ "hop": hop_idx_display, "total": hop_total, "name": name, "phase": "connecting" }),
                        );
                    }
                    let channel = match cur
                        .channel_open_direct_tcpip(nh.clone(), np as u32, "127.0.0.1".to_string(), 0)
                        .await
                    {
                        Ok(c) => c,
                        Err(e) => {
                            if prefer_resume && !is_target && !jump_handles.is_empty() {
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            }
                            return Err(anyhow!(Self::format_hop_failure(
                                hop_idx_display.max(1),
                                hop_total.max(1),
                                &name,
                                &format!("{nh}:{np}"),
                                &format!("{e:#}"),
                            )));
                        }
                    };
                    let stream = channel.into_stream();
                    jump_handles.push(Arc::new(AsyncMutex::new(cur)));
                    let hop_agent = if is_target {
                        target_agent_sock.clone()
                    } else {
                        None
                    };
                    let handler = self.make_handler(&app, &nh, np, hop_agent);
                    cur = match client::connect_stream(config.clone(), stream, handler).await {
                        Ok(h) => h,
                        Err(e) => {
                            if prefer_resume && !is_target {
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            }
                            return Err(anyhow!(Self::format_hop_failure(
                                hop_idx_display.max(1),
                                hop_total.max(1),
                                &name,
                                &format!("{nh}:{np}"),
                                &format!("{e:#}"),
                            )));
                        }
                    };
                    if let Err(e) = Self::authenticate_handle(
                        &mut cur,
                        &nu,
                        npw.as_deref(),
                        npk.as_deref(),
                        npp.as_deref(),
                        nam.as_deref(),
                        if is_target {
                            opts.agent_socket.as_deref()
                        } else {
                            None
                        },
                    )
                    .await
                    {
                        if prefer_resume && !is_target {
                            // pop the just-pushed previous? jump_handles already has previous hops
                            self.jump_slots.lock().insert(
                                slot_key.clone(),
                                JumpSlot {
                                    handles: jump_handles.clone(),
                                    at: chrono::Utc::now().timestamp_millis(),
                                },
                            );
                        }
                        return Err(anyhow!(Self::format_hop_failure(
                            hop_idx_display.max(1),
                            hop_total.max(1),
                            &name,
                            &format!("{nh}:{np}"),
                            &format!("{e:#}"),
                        )));
                    }
                }
            } else {
                // Fresh chain: connect first remaining hop via TCP if start_idx==0 and first is hop
                let Some((ci0, (h0, p0, u0, pw0, pk0, pp0, am0, is_target0))) = chain_iter.next() else {
                    return Err(anyhow!("empty jump chain"));
                };
                let name0 = if is_target0 {
                    opts.host.clone()
                } else {
                    hops.get(start_idx + ci0)
                        .and_then(|h| h.label.clone())
                        .unwrap_or_else(|| h0.clone())
                };
                if !is_target0 {
                    let _ = app.emit(
                        "ssh:hop",
                        json!({ "hop": 1u32, "total": hop_total, "name": name0, "phase": "connecting" }),
                    );
                }
                let handler = self.make_handler(
                    &app,
                    &h0,
                    p0,
                    if is_target0 {
                        target_agent_sock.clone()
                    } else {
                        None
                    },
                );
                cur = match client::connect(config.clone(), (h0.as_str(), p0), handler).await {
                    Ok(h) => h,
                    Err(e) => {
                        return Err(anyhow!(Self::format_hop_failure(
                            1,
                            hop_total.max(1),
                            &name0,
                            &format!("{h0}:{p0}"),
                            &format!("{e:#}"),
                        )));
                    }
                };
                if let Err(e) = Self::authenticate_handle(
                    &mut cur,
                    &u0,
                    pw0.as_deref(),
                    pk0.as_deref(),
                    pp0.as_deref(),
                    am0.as_deref(),
                    if is_target0 {
                        opts.agent_socket.as_deref()
                    } else {
                        None
                    },
                )
                .await
                {
                    return Err(anyhow!(Self::format_hop_failure(
                        1,
                        hop_total.max(1),
                        &name0,
                        &format!("{h0}:{p0}"),
                        &format!("{e:#}"),
                    )));
                }

                for (ci, (nh, np, nu, npw, npk, npp, nam, is_target)) in chain_iter {
                    let hop_idx_display = if is_target {
                        hop_total
                    } else {
                        (start_idx + ci + 1) as u32
                    };
                    let name = if is_target {
                        opts.label.clone().unwrap_or_else(|| opts.host.clone())
                    } else {
                        hops.get(start_idx + ci)
                            .and_then(|h| h.label.clone())
                            .unwrap_or_else(|| nh.clone())
                    };
                    if !is_target {
                        let _ = app.emit(
                            "ssh:hop",
                            json!({ "hop": hop_idx_display, "total": hop_total, "name": name, "phase": "connecting" }),
                        );
                    }
                    let channel = match cur
                        .channel_open_direct_tcpip(nh.clone(), np as u32, "127.0.0.1".to_string(), 0)
                        .await
                    {
                        Ok(c) => c,
                        Err(e) => {
                            if prefer_resume && !jump_handles.is_empty() {
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            } else if prefer_resume {
                                // first hop ok, failure forwarding — park cur as first hop
                                jump_handles.push(Arc::new(AsyncMutex::new(cur)));
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                                return Err(anyhow!(Self::format_hop_failure(
                                    hop_idx_display.max(1),
                                    hop_total.max(1),
                                    &name,
                                    &format!("{nh}:{np}"),
                                    &format!("{e:#}"),
                                )));
                            }
                            return Err(anyhow!(Self::format_hop_failure(
                                hop_idx_display.max(1),
                                hop_total.max(1),
                                &name,
                                &format!("{nh}:{np}"),
                                &format!("{e:#}"),
                            )));
                        }
                    };
                    let stream = channel.into_stream();
                    jump_handles.push(Arc::new(AsyncMutex::new(cur)));
                    let hop_agent = if is_target {
                        target_agent_sock.clone()
                    } else {
                        None
                    };
                    let handler = self.make_handler(&app, &nh, np, hop_agent);
                    cur = match client::connect_stream(config.clone(), stream, handler).await {
                        Ok(h) => h,
                        Err(e) => {
                            if prefer_resume {
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            }
                            return Err(anyhow!(Self::format_hop_failure(
                                hop_idx_display.max(1),
                                hop_total.max(1),
                                &name,
                                &format!("{nh}:{np}"),
                                &format!("{e:#}"),
                            )));
                        }
                    };
                    if let Err(e) = Self::authenticate_handle(
                        &mut cur,
                        &nu,
                        npw.as_deref(),
                        npk.as_deref(),
                        npp.as_deref(),
                        nam.as_deref(),
                        if is_target {
                            opts.agent_socket.as_deref()
                        } else {
                            None
                        },
                    )
                    .await
                    {
                        if prefer_resume && !is_target {
                            self.jump_slots.lock().insert(
                                slot_key.clone(),
                                JumpSlot {
                                    handles: jump_handles.clone(),
                                    at: chrono::Utc::now().timestamp_millis(),
                                },
                            );
                        }
                        return Err(anyhow!(Self::format_hop_failure(
                            hop_idx_display.max(1),
                            hop_total.max(1),
                            &name,
                            &format!("{nh}:{np}"),
                            &format!("{e:#}"),
                        )));
                    }
                }
            }

            self.jump_slots.lock().remove(&slot_key);
            handle = cur;
        }
'''
    # The new_else has a problem - I used r''' with escaped content incorrectly mixed.
    # Actually I used r'''...''' so backslashes are literal - good for Rust.
    # But the string starts with newline + "        } else {" which replaces from old_else_start
    # old_else_start begins with "        } else {" - good
    t = t[:start] + new_else + t[end:]
    print("jump else replaced", start, end)
elif "prefer_resume" in t:
    print("jump resume already present")
else:
    raise SystemExit("old else start missing")

# After successful connect, emit stage shell
if 'emit(\n                    "ssh:stage"' not in t and 'emit("ssh:stage"' not in t:
    t = t.replace(
        """        if opts.agent_forward.unwrap_or(false) {
            let _ = channel.agent_forward(true).await;
        }

        let meta = SessionMeta {""",
        """        if opts.agent_forward.unwrap_or(false) {
            let _ = channel.agent_forward(true).await;
        }
        let _ = app.emit("ssh:stage", json!({ "stage": "shell", "host": opts.host, "port": port }));

        let meta = SessionMeta {""",
    )

p.write_text(t, encoding="utf-8")
print("ssh.rs size", p.stat().st_size)
# sanity: prefer_resume count
print("prefer_resume", t.count("prefer_resume"))
print("jump_slots", t.count("jump_slots"))
