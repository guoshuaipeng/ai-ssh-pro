from pathlib import Path
p = Path(r"src/renderer/src/tauri-bridge.ts")
text = p.read_text(encoding="utf-8")

replacements = [
(
'''      trash: async () => ({ token: '', note: 'trash not ported' }),
      restore: async () => false,''',
'''      trash: (target: string) => invoke<{ token: string }>('local_fs_trash', { target }),
      restore: (token: string) => invoke<boolean>('local_fs_restore', { token }),'''
),
(
'''      importPick: async () => null,
      importSshConfig: async () => ({ items: [], warnings: [] }),
      export: () => notImpl('sessions.export'),''',
'''      importPick: () => invoke('sessions_import_pick'),
      importSshConfig: (path?: string) =>
        invoke('sessions_import_ssh_config', { path: path ?? null }),
      export: (format?: string) => invoke<string>('sessions_export', { format: format ?? 'json' }),'''
),
(
'''    tools: {
      processes: async () => [],
      kill: () => notImpl('tools.kill'),
      services: async () => [],
      service: () => notImpl('tools.service'),
      ports: async () => [],
      df: async () => [],
      logs: async () => ({ text: '', code: null, at: Date.now() })
    },''',
'''    tools: {
      processes: (sessionId: string) => invoke('tools_processes', { sessionId }),
      kill: (sessionId: string, pid: number, signal?: string, sudo?: boolean) =>
        invoke('tools_kill', { sessionId, pid, signal: signal ?? null, sudo: sudo ?? null }),
      services: (sessionId: string) => invoke('tools_services', { sessionId }),
      service: (sessionId: string, unit: string, action: string, sudo?: boolean) =>
        invoke('tools_service', { sessionId, unit, action, sudo: sudo ?? null }),
      ports: (sessionId: string) => invoke('tools_ports', { sessionId }),
      df: (sessionId: string) => invoke('tools_df', { sessionId }),
      logs: (sessionId: string, req: unknown) => invoke('tools_logs', { sessionId, req })
    },'''
),
(
'''      batchExec: () => notImpl('workspace.batchExec'),
      resources: async () => ({ at: Date.now() }),
      healthProbe: () => notImpl('workspace.healthProbe'),
      healthProbeSweep: async () => ({ ok: true }),
      healthProbeRelease: async () => ({ ok: true }),''',
'''      batchExec: (payload: unknown) => invoke('workspace_batch_exec', { payload }),
      resources: async () => ({ at: Date.now() }),
      healthProbe: (payload: unknown) => invoke('workspace_health_probe', { payload }),
      healthProbeSweep: () => invoke('workspace_health_probe_sweep'),
      healthProbeRelease: () => invoke('workspace_health_probe_release'),'''
),
(
'''    snapshots: {
      list: async () => [],
      stats: async () => ({ files: 0, bytes: 0, count: 0 }),
      put: async () => ({ added: false, skipped: 'not implemented', count: 0 }),
      setPrefs: async (prefs: any) => ({ auto: !!prefs?.auto, keep: prefs?.keep ?? 10 }),
      read: async () => ({ ok: false, reason: 'not implemented' }),
      pin: async () => null,
      delete: async () => ({ ok: false }),
      clear: async () => ({ ok: true, n: 0 }),
      openDir: async () => ({ ok: false })
    }''',
'''    snapshots: {
      list: (query?: unknown) => invoke('snapshots_list', { query: query ?? null }),
      stats: () => invoke('snapshots_stats'),
      put: (input: unknown) => invoke('snapshots_put', { input }),
      setPrefs: (prefs: unknown) => invoke('snapshots_set_prefs', { input: prefs ?? null }),
      read: (id: string) => invoke('snapshots_read', { id }),
      pin: (id: string, pinned: boolean) => invoke('snapshots_pin', { id, pinned }),
      delete: (id: string) => invoke('snapshots_delete', { id }),
      clear: () => invoke('snapshots_clear'),
      openDir: () => invoke('snapshots_open_dir'),
      rollbackAllowed: (level: string) => invoke<boolean>('snapshots_rollback_allowed', { level })
    }'''
),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"block not found:\n{old[:80]}")
    text = text.replace(old, new, 1)

# Wire OpenClaw / core_memory extras if bridge has coreMemory section
if "coreMemory:" in text and "appendEpisode" not in text:
    # try inject after appendObservations
    needle = "appendObservations:"
    idx = text.find(needle)
    if idx < 0:
        raise SystemExit("appendObservations not found")
    # find end of that method line/block - rough: next line with comma closing
    # Look for common pattern
    import re
    m = re.search(r"appendObservations:\s*\([^)]*\)\s*=>\s*invoke\([^)]+\),?", text)
    if m:
        insert = m.group(0) + """
      appendEpisode: (sessionKey: string, text: string, tags?: string[]) =>
        invoke('core_memory_append_episode', { sessionKey, text, tags: tags ?? null }),
      setCiteHold: (sessionKey: string, markers: string[]) =>
        invoke('core_memory_set_cite_hold', { sessionKey, markers }),
      compress: (sessionKey: string, piece: string, cursor?: string) =>
        invoke('core_memory_compress', { sessionKey, piece, cursor: cursor ?? null }),"""
        text = text[:m.start()] + insert + text[m.end():]
    else:
        print("WARN: could not inject coreMemory extras")

p.write_text(text, encoding="utf-8")
print("bridge patched")
