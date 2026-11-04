from pathlib import Path
import re
p = Path(r"E:\pythonProjects\ai-ssh-pro\src\renderer\src\tauri-bridge.ts")
t = p.read_text(encoding="utf-8")
t = t.replace(
  " * Stubs remain for OpenClaw Agent / swarm watch / cloud sync / updater.",
  " * Round-5: Swarm/watch/openShell, SFTP resume, OpenClaw Core-A, sync/updater skeletons, hashed known_hosts lookup."
)
t = t.replace(
  "lookupHost: async () => ({ ok: false, query: '', file: '', matches: [] })",
  "lookupHost: (host: string, port?: number) =>\n        invoke('known_hosts_lookup_host', { host, port: port ?? null, filePath: null })"
)
old_docker = """    docker: {
      listTree: (sessionId: string) => invoke('docker_list_tree', { sessionId }),
      watchEvents: async () => false,
      unwatchEvents: async () => false,
      onChanged: (_cb: AnyFn) => () => {},
      containerAction: (sessionId: string, containerId: string, action: string) =>
        invoke<boolean>('docker_container_action', { sessionId, containerId, action }),
      inspect: (sessionId: string, containerId: string) =>
        invoke('docker_inspect', { sessionId, containerId }),
      logs: (sessionId: string, containerId: string, tail?: number) =>
        invoke<string>('docker_logs', { sessionId, containerId, tail: tail ?? null }),
      swarmInspect: () => notImpl('docker.swarmInspect'),
      swarmLogs: async () => '',
      swarmAction: async () => false,
      composePs: (sessionId: string, project: string) =>
        invoke('docker_compose_ps', { sessionId, project }),
      composeAction: (sessionId: string, project: string, action: string) =>
        invoke<boolean>('docker_compose_action', { sessionId, project, action }),
      openShell: () => notImpl('docker.openShell')
    },"""
new_docker = """    docker: {
      listTree: (sessionId: string) => invoke('docker_list_tree', { sessionId }),
      watchEvents: (sessionId: string) => invoke<boolean>('docker_watch_events', { sessionId }),
      unwatchEvents: (sessionId: string) => invoke<boolean>('docker_unwatch_events', { sessionId }),
      onChanged: (cb: AnyFn) => listen('docker:changed', cb),
      containerAction: (sessionId: string, containerId: string, action: string) =>
        invoke<boolean>('docker_container_action', { sessionId, containerId, action }),
      inspect: (sessionId: string, containerId: string) =>
        invoke('docker_inspect', { sessionId, containerId }),
      logs: (sessionId: string, containerId: string, tail?: number) =>
        invoke<string>('docker_logs', { sessionId, containerId, tail: tail ?? null }),
      swarmInspect: (sessionId: string, service: string) =>
        invoke('docker_swarm_inspect', { sessionId, service }),
      swarmLogs: (sessionId: string, service: string, tail?: number) =>
        invoke<string>('docker_swarm_logs', { sessionId, service, tail: tail ?? null }),
      swarmAction: (sessionId: string, service: string, action: string, replicas?: number) =>
        invoke<boolean>('docker_swarm_action', {
          sessionId,
          service,
          action,
          replicas: replicas ?? null
        }),
      composePs: (sessionId: string, project: string) =>
        invoke('docker_compose_ps', { sessionId, project }),
      composeAction: (sessionId: string, project: string, action: string) =>
        invoke<boolean>('docker_compose_action', { sessionId, project, action }),
      openShell: (
        sessionId: string,
        containerId: string,
        opts?: { termCols?: number; termRows?: number; label?: string }
      ) => invoke('docker_open_shell', { sessionId, containerId, opts: opts ?? null })
    },"""
assert old_docker in t, "docker block missing"
t = t.replace(old_docker, new_docker)
t = t.replace(
  "transfer: () => notImpl('sftp.transfer'),",
  """transfer: (
        sessionId: string,
        direction: string,
        localPath: string,
        remotePath: string,
        offset?: number
      ) =>
        invoke('sftp_transfer', {
          sessionId,
          direction,
          localPath,
          remotePath,
          offset: offset ?? null
        }),"""
)
t = t.replace(
  "resolveConfirm: async () => {},",
  "resolveConfirm: (requestId: string, ok: boolean) =>\n        invoke('ai_resolve_confirm', { requestId, ok }),"
)
old_sync = """    sync: {
      getConfig: async () => null,
      setConfig: async (patch: unknown) => patch,
      test: async () => ({ ok: false, message: 'not implemented' }),
      push: async () => ({ ok: false, message: 'not implemented' }),
      pull: async () => ({ ok: false, message: 'not implemented' }),
      backupLocal: async () => ({ ok: false })
    },"""
new_sync = """    sync: {
      getConfig: () => invoke('sync_get_config'),
      setConfig: (patch: unknown) => invoke('sync_set_config', { patch }),
      test: () => invoke('sync_test'),
      push: (passphrase: string) => invoke('sync_push', { passphrase }),
      pull: (passphrase: string) => invoke('sync_pull', { passphrase }),
      backupLocal: () => invoke('sync_backup_local')
    },"""
assert old_sync in t, "sync block missing"
t = t.replace(old_sync, new_sync)
t = t.replace(
  "checkUpdate: () => invoke('app_check_update'),",
  "checkUpdate: (opts?: unknown) => invoke('app_check_update', { opts: opts ?? null }),"
)
p.write_text(t, encoding="utf-8")
print("bridge patched")
# find listen helper
for m in re.finditer(r"function listen|const listen|listen\s*=|from '@tauri-apps", t):
    print("at", m.start(), m.group())
