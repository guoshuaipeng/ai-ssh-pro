from pathlib import Path

# agent tools
ap = Path("src-tauri/src/agent.rs")
a = ap.read_text(encoding="utf-8")
if "memory_observe" not in a:
    a = a.replace(
        '''                    "memory_archive_goal" => {
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
                    other => format!("unknown tool: {other}"),''',
        '''                    "memory_archive_goal" => {
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
                    "memory_observe" => {
                        let key = args
                            .get("sessionKey")
                            .or_else(|| args.get("key"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("default");
                        let mut texts = Vec::new();
                        if let Some(arr) = args.get("texts").and_then(|v| v.as_array()) {
                            for v in arr {
                                if let Some(s) = v.as_str() {
                                    texts.push(s.to_string());
                                }
                            }
                        } else if let Some(s) = args.get("text").and_then(|v| v.as_str()) {
                            texts.push(s.to_string());
                        }
                        serde_json::to_string(&crate::core_memory::append_observations(key, texts))
                            .unwrap_or_else(|_| "[]".into())
                    }
                    "memory_list_threads" => crate::core_memory::list_threads().to_string(),
                    other => format!("unknown tool: {other}"),'''
    )
    a = a.replace(
        "可用 tool：get_terminal_snapshot；inventory_search/get/context/append_note；memory_get/context/set_goal/archive_goal（HITL 归档）。",
        "可用 tool：get_terminal_snapshot；inventory_search/get/context/append_note；memory_get/context/set_goal/archive_goal/observe/list_threads（多线程+观测记忆）。",
    )
    ap.write_text(a, encoding="utf-8")
    print("agent tools ok")
else:
    print("agent already")

# bridge
bp = Path("src/renderer/src/tauri-bridge.ts")
b = bp.read_text(encoding="utf-8")
b = b.replace(
    " * Round-6: agent forward + probeJump UX, inventory/core-memory, hashed bulk lookup, sync wizard local config.",
    " * Round-7: jump resume slots, observational memory, localFs/files, sync schedule/conflicts, desktop shortcut.",
)

# localFs block
old_lfs = """      home: async () => '',
      drives: async () => ({ drives: [], cwd: '' }),
      list: async () => ({ path: '', entries: [] }),
      stat: async () => null,
      mkdir: async () => false,
      rename: async () => false,
      trash: async () => ({ token: '' }),
      restore: async () => false,
      reveal: async () => false,
      open: async () => '',
      hash: async () => '',
      readText: async () => ({ ok: false, content: '', truncated: false }),
      detectKeyKind: async () => 'unknown',
      pickPrivateKey: async () => null,
      pickCertificate: async () => null
    },"""

# Check actual structure - may be under localFs key
if "local_fs_home" not in b:
    if old_lfs in b:
        b = b.replace(
            old_lfs,
            """      home: () => invoke<string>('local_fs_home'),
      drives: () => invoke('local_fs_drives'),
      list: (dir?: string) => invoke('local_fs_list', { dir: dir ?? null }),
      stat: (target: string) => invoke('local_fs_stat', { target }),
      mkdir: (target: string) => invoke<boolean>('local_fs_mkdir', { target }),
      rename: (from: string, to: string) => invoke<boolean>('local_fs_rename', { from, to }),
      trash: async () => ({ token: '', note: 'trash not ported' }),
      restore: async () => false,
      reveal: (target: string) => invoke<boolean>('local_fs_reveal', { target }),
      open: (target: string) => invoke<string>('local_fs_open', { target }),
      hash: async () => '',
      readText: (target: string, maxBytes?: number) =>
        invoke('local_fs_read_text', { target, maxBytes: maxBytes ?? null }),
      detectKeyKind: async () => 'unknown',
      pickPrivateKey: () => invoke<string | null>('pick_private_key'),
      pickCertificate: () => invoke<string | null>('pick_certificate')
    },""",
        )
        print("localFs patched")
    else:
        print("localFs block NOT FOUND")
        idx = b.find("home: async () => ''")
        print(repr(b[idx-80:idx+200]) if idx>=0 else "no home stub")

# knownHosts listLocalKeys
if "local_fs_list_keys" not in b:
    b = b.replace(
        """      listLocalKeys: async () => ({ dir: '', keys: [] }),
      openSshDir: async () => false,""",
        """      listLocalKeys: () => invoke('local_fs_list_keys'),
      openSshDir: () => invoke<boolean>('local_fs_open_ssh_dir'),""",
    )

# coreMemory extend
if "listThreads" not in b:
    b = b.replace(
        """      clearWorking: (sessionKey: string) =>
        invoke<boolean>('core_memory_clear_working', { sessionKey })
    },""",
        """      clearWorking: (sessionKey: string) =>
        invoke<boolean>('core_memory_clear_working', { sessionKey }),
      listThreads: () => invoke('core_memory_list_threads'),
      bumpEpoch: (sessionKey: string) => invoke<number>('core_memory_bump_epoch', { sessionKey }),
      appendObservations: (sessionKey: string, texts: string[]) =>
        invoke('core_memory_append_observations', { sessionKey, texts })
    },""",
    )

# sync extend
if "scheduleStatus" not in b:
    b = b.replace(
        """      backupLocal: () => invoke('sync_backup_local')
    },""",
        """      backupLocal: () => invoke('sync_backup_local'),
      getBase: () => invoke('sync_get_base'),
      setBase: (base: unknown) => invoke('sync_set_base', { base }),
      findConflicts: (local: unknown[], remote: unknown[], base?: unknown) =>
        invoke('sync_find_conflicts', { local, remote, base: base ?? null }),
      scheduleStatus: () => invoke('sync_schedule_status'),
      scheduleTick: (result?: unknown) => invoke('sync_schedule_tick', { result: result ?? null }),
      onScheduleTick: (cb: AnyFn) =>
        unsubListen(
          listen('sync:scheduleTick', (e) => {
            cb(e.payload)
          })
        )
    },""",
    )

# files
if "files_save_text" not in b:
    b = b.replace(
        """    files: {
      saveText: async () => null,
      saveBytes: async () => null,
      reveal: async () => false
    },""",
        """    files: {
      saveText: async (defaultName?: string, content?: string) => {
        if (typeof content === 'string') {
          return invoke<string | null>('files_save_text', {
            defaultName: defaultName ?? null,
            content
          })
        }
        return invoke<string | null>('files_pick_save_text', { defaultName: defaultName ?? null })
      },
      saveBytes: async () => null,
      reveal: (target: string) => invoke<boolean>('files_reveal', { target })
    },""",
    )

bp.write_text(b, encoding="utf-8")
print("bridge done")
