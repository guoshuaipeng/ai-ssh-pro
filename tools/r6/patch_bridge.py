from pathlib import Path
p = Path("src/renderer/src/tauri-bridge.ts")
t = p.read_text(encoding="utf-8")

t = t.replace(
    " * Round-5: Swarm/watch/openShell, SFTP resume, OpenClaw Core-A, sync/updater skeletons, hashed known_hosts lookup.",
    " * Round-6: agent forward + probeJump UX, inventory/core-memory, hashed bulk lookup, sync wizard local config.",
)

old_probe = """      probeJump: async () => [],
      onHop: (_cb: AnyFn) => () => {},
      onStage: (_cb: AnyFn) => () => {}
    },"""

new_probe = """      probeJump: (opts: unknown) => invoke('ssh_probe_jump', { opts }),
      onHop: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:hop', (e) => {
            cb(e.payload)
          })
        ),
      onStage: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:stage', (e) => {
            cb(e.payload)
          })
        )
    },"""

if "ssh_probe_jump" not in t:
    if old_probe not in t:
        raise SystemExit("probe block missing")
    t = t.replace(old_probe, new_probe)

old_kh = """      lookupHost: (host: string, port?: number) =>
        invoke('known_hosts_lookup_host', { host, port: port ?? null, filePath: null })"""

# need to see surrounding for comma
idx = t.find("lookupHost:")
print("lookup context:\n", t[idx:idx+250])

old_inv = """    inventory: {
      list: async () => [],
      get: async () => null,
      search: async () => [],
      upsert: () => notImpl('inventory.upsert'),
      remove: async () => false,
      setServices: async () => null
    },"""

new_inv = """    inventory: {
      list: () => invoke('inventory_list'),
      get: (id: string) => invoke('inventory_get', { id }),
      search: (query: string) => invoke('inventory_search', { query }),
      upsert: (input: unknown) => invoke('inventory_upsert', { input }),
      remove: (id: string) => invoke<boolean>('inventory_remove', { id }),
      setServices: (hostId: string, services: unknown) =>
        invoke('inventory_set_services', { hostId, services }),
      appendNote: (hostId: string, note: string) =>
        invoke('inventory_append_note', { hostId, note }),
      upsertService: (hostId: string, service: unknown) =>
        invoke('inventory_upsert_service', { hostId, service }),
      formatContext: (opts?: { hostId?: string; host?: string; port?: number }) =>
        invoke<string>('inventory_format_context', {
          hostId: opts?.hostId ?? null,
          host: opts?.host ?? null,
          port: opts?.port ?? null
        })
    },
    coreMemory: {
      get: (sessionKey: string) => invoke('core_memory_get', { sessionKey }),
      context: (sessionKey: string) => invoke<string>('core_memory_context', { sessionKey }),
      setGoal: (sessionKey: string, goal: string) =>
        invoke<boolean>('core_memory_set_goal', { sessionKey, goal }),
      archiveGoal: (sessionKey: string, goal?: string) =>
        invoke<boolean>('core_memory_archive_goal', { sessionKey, goal: goal ?? null }),
      clearWorking: (sessionKey: string) =>
        invoke<boolean>('core_memory_clear_working', { sessionKey })
    },"""

if "inventory_list" not in t:
    if old_inv not in t:
        raise SystemExit("inventory block missing")
    t = t.replace(old_inv, new_inv)

# Add lookupHostsBulk after lookupHost
if "lookupHostsBulk" not in t:
    t = t.replace(
        """      lookupHost: (host: string, port?: number) =>
        invoke('known_hosts_lookup_host', { host, port: port ?? null, filePath: null })""",
        """      lookupHost: (host: string, port?: number) =>
        invoke('known_hosts_lookup_host', { host, port: port ?? null, filePath: null }),
      lookupHostsBulk: (hosts: Array<{ host: string; port?: number }>, filePath?: string | null) =>
        invoke('known_hosts_lookup_hosts_bulk', { hosts, filePath: filePath ?? null })""",
    )

p.write_text(t, encoding="utf-8")
print("bridge ok")
