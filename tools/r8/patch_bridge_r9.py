from pathlib import Path
p = Path("src/renderer/src/tauri-bridge.ts")
t = p.read_text(encoding="utf-8")
repls = [
(
"""      hash: async () => '',
      cancel: async () => false,""",
"""      hash: (sessionId: string, remotePath: string, maxBytes?: number) =>
        invoke<string>('sftp_hash', { sessionId, remotePath, maxBytes: maxBytes ?? null }),
      cancel: async () => false,""",
),
(
"""      hash: async () => '',
      readText:""",
"""      hash: (target: string, maxBytes?: number) =>
        invoke<string>('local_fs_hash', { target, maxBytes: maxBytes ?? null }),
      readText:""",
),
(
"""      detectKeyKind: async () => 'unknown',""",
"""      detectKeyKind: (target: string) => invoke<string>('local_fs_detect_key_kind', { target }),""",
),
(
"""      resources: async () => ({ at: Date.now() }),""",
"""      resources: (sessionId: string) => invoke('workspace_resources', { sessionId }),""",
),
(
"""      healthProbeSweep: () => invoke('workspace_health_probe_sweep'),
      healthProbeRelease: () => invoke('workspace_health_probe_release'),""",
"""      healthProbeSweep: (idleMs?: number) =>
        invoke('workspace_health_probe_sweep', { idleMs: idleMs ?? null }),
      healthProbeRelease: (profileId?: string) =>
        invoke('workspace_health_probe_release', { profileId: profileId ?? null }),""",
),
(
"""        restore: async () => ({ ok: false, restored: [], skipped: [] }),""",
"""        restore: (payload: unknown) => invoke('forwards_restore', { payload }),""",
),
]
for old, new in repls:
    if old not in t:
        raise SystemExit(f"missing block: {old[:60]}")
    t = t.replace(old, new, 1)

# coreMemory compactTurns / recall
if "compactTurns:" not in t:
    needle = "compress: (sessionKey: string, piece: string, cursor?: string) =>"
    idx = t.find(needle)
    if idx < 0:
        raise SystemExit("compress not found")
    # find end of compress line(s)
    end = t.find("\n", t.find("invoke('core_memory_compress'", idx))
    # include through that line
    line_end = t.find("\n", end)
    insert = """
      compactTurns: (sessionKey: string, turns: unknown[], maxTurns?: number) =>
        invoke('core_memory_compact_turns', {
          sessionKey,
          turns,
          maxTurns: maxTurns ?? null
        }),
      recall: (sessionKey: string, query: string, topK?: number) =>
        invoke('core_memory_recall', { sessionKey, query, topK: topK ?? null }),"""
    # after compress invoke line
    # find the full compress property ending with },
    import re
    m = re.search(
        r"compress:\s*\([^)]*\)\s*=>\s*invoke\('core_memory_compress',[^\n]+\n?",
        t,
    )
    if not m:
        raise SystemExit("compress invoke not matched")
    t = t[: m.end()] + insert + t[m.end() :]

p.write_text(t, encoding="utf-8")
print("bridge r9 patched")
