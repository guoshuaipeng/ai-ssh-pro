from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
bridge = ROOT / "src/renderer/src/tauri-bridge.ts"
text = bridge.read_text(encoding="utf-8")

replacements = [
(
'''      startRecording: async () => null,
      stopRecording: async () => false,''',
'''      startRecording: (sessionId: string, opts?: unknown) =>
        invoke<string | null>('ssh_start_recording', { sessionId, opts: opts ?? null }),
      stopRecording: (sessionId: string) => invoke<boolean>('ssh_stop_recording', { sessionId }),'''
),
(
'''      pickImport: async () => null,''',
'''      pickImport: () => invoke('known_hosts_pick_import'),'''
),
(
'''    docker: {
      listTree: async () => ({ containers: [], compose: [], swarm: [], error: 'not implemented' }),
      watchEvents: async () => false,
      unwatchEvents: async () => false,
      onChanged: (_cb: AnyFn) => () => {},
      containerAction: async () => false,
      inspect: () => notImpl('docker.inspect'),
      logs: async () => '',
      swarmInspect: () => notImpl('docker.swarmInspect'),
      swarmLogs: async () => '',
      swarmAction: async () => false,
      composePs: async () => ({ services: [], error: 'not implemented' }),
      composeAction: async () => false,
      openShell: () => notImpl('docker.openShell')
    },''',
'''    docker: {
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
    },'''
),
(
'''      pickDownloadPath: async () => null,
      pickUploadFiles: async () => null,
      pickSavePaths: async () => null,''',
'''      pickDownloadPath: (defaultName?: string) =>
        invoke<string | null>('sftp_pick_download_path', { defaultName: defaultName ?? null }),
      pickUploadFiles: () => invoke<string[] | null>('sftp_pick_upload_files'),
      pickSavePaths: (names: string[]) => invoke<string[] | null>('sftp_pick_save_paths', { names }),'''
),
(
'''      queueLoad: async () => [],
      queueSave: async (tasks: unknown) => tasks''',
'''      queueLoad: () => invoke('sftp_queue_load'),
      queueSave: (tasks: unknown) => invoke('sftp_queue_save', { tasks })'''
),
(
'''      parseSsh: () => notImpl('ai.parseSsh'),
      assist: () => notImpl('ai.assist'),
      abortAssist: async () => {},''',
'''      parseSsh: (text: string) => invoke('ai_parse_ssh', { text }),
      assist: (req: unknown) => invoke('ai_assist', { req }),
      abortAssist: async (requestId?: string) => {
        await invoke('ai_abort_assist', { requestId: requestId ?? null })
      },'''
),
(
'''    backup: {
      export: () => notImpl('backup.export'),
      import: () => notImpl('backup.import')
    },''',
'''    backup: {
      export: (raw: unknown) => invoke('backup_export', { raw }),
      import: (raw: unknown) => invoke('backup_import', { raw })
    },'''
),
(
'''    recordings: {
      list: async () => [],
      read: async () => '',
      delete: async () => false
    },''',
'''    recordings: {
      list: () => invoke('recordings_list'),
      read: (file: string) => invoke<string>('recordings_read', { file }),
      delete: (file: string) => invoke<boolean>('recordings_delete', { file })
    },'''
),
]
for old, new in replacements:
    if old not in text:
        print("MISSING block:\n", old[:120])
        raise SystemExit(1)
    text = text.replace(old, new, 1)
    print("patched", old.splitlines()[0][:60])

# header comment
text = text.replace(
    " * Stubs: Docker/OpenClaw Agent/recording/backup — return safe empty values.",
    " * Stubs remain for OpenClaw Agent / swarm watch / cloud sync / updater.",
)

bridge.write_text(text, encoding="utf-8")
print("bridge ok", bridge.stat().st_size)