/**
 * Tauri bridge: exposes window.aiss with the same shape as Electron preload.
 * Real: SSH connect/write/resize/exec, sessions store, app helpers.
 * Round-7: jump resume slots, observational memory, localFs/files, sync schedule/conflicts, desktop shortcut.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'
import { openUrl } from '@tauri-apps/plugin-opener'
import { normalizeTerminalPrefs } from '@shared/terminal-prefs'
import { type TerminalPrefs } from '@shared/ipc'

type AnyFn = (...args: any[]) => any

function unsubListen(p: Promise<UnlistenFn>): () => void {
  let u: UnlistenFn | null = null
  void p.then((fn) => {
    u = fn
  })
  return () => {
    if (u) u()
  }
}

async function notImpl(name: string): Promise<never> {
  throw new Error(`${name} is not yet implemented in the Tauri build`)
}

function emptySessions() {
  return { folders: [], profiles: [] }
}

export async function installTauriBridge(): Promise<void> {
  const api: any = {
    clipboard: {
      writeText: (text: string) => {
        void writeText(String(text ?? ''))
      },
      readText: () => {
        // sync API in Electron; approximate with empty and async fill is hard — use sync cache
        return ''
      }
    },
    app: {
      onOpenDialog: (_cb: AnyFn) => () => {},
      getVersion: () => invoke<string>('app_get_version'),
      checkUpdate: (opts?: unknown) => invoke('app_check_update', { opts: opts ?? null }),
      focus: () => invoke<boolean>('app_focus'),
      openExternal: async (url: string) => {
        await openUrl(url)
        return true
      },
      openGithub: () => invoke<boolean>('app_open_github'),
      getMcpGuideInfo: () => invoke('app_get_mcp_guide'),
      setUiChrome: (chrome: unknown) => invoke<boolean>('app_set_ui_chrome', { chrome })
    },
    ssh: {
      connect: (opts: unknown) => invoke('ssh_connect', { opts }),
      disconnect: (sessionId: string) => invoke('ssh_disconnect', { sessionId }),
      write: async (sessionId: string, data: string | Uint8Array | number[]) => {
        let s: string
        if (typeof data === 'string') s = data
        else if (data instanceof Uint8Array) s = new TextDecoder().decode(data)
        else s = new TextDecoder().decode(Uint8Array.from(data))
        return invoke<boolean>('ssh_write', { sessionId, data: s })
      },
      resize: (sessionId: string, cols: number, rows: number) =>
        invoke<boolean>('ssh_resize', { sessionId, cols, rows }),
      getSnapshot: (sessionId: string, options?: unknown) =>
        invoke<string | null>('ssh_get_snapshot', { sessionId, options: options ?? null }),
      respondHostKey: (payload: unknown) => invoke<boolean>('ssh_respond_host_key', { payload }),
      openLocalShell: (opts?: unknown) => invoke('ssh_open_local_shell', { opts: opts ?? null }),
      isLocalShellAvailable: () => invoke<boolean>('ssh_is_local_shell_available'),
      startRecording: (sessionId: string, opts?: unknown) =>
        invoke<string | null>('ssh_start_recording', { sessionId, opts: opts ?? null }),
      stopRecording: (sessionId: string) => invoke<boolean>('ssh_stop_recording', { sessionId }),
      setShellIntegration: async () => true,
      exec: (sessionId: string, command: string, timeoutMs?: number) =>
        invoke('ssh_exec', { sessionId, command, timeoutMs: timeoutMs ?? null }),
      onData: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:data', (e) => {
            cb(e.payload)
          })
        ),
      onStatus: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:status', (e) => {
            cb(e.payload)
          })
        ),
      onHostKeyPrompt: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:hostKeyPrompt', (e) => {
            cb(e.payload)
          })
        ),
      onPowerResume: (_cb: AnyFn) => () => {},
      onHostKeyExpired: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:hostKeyExpired', (e) => {
            cb(e.payload)
          })
        ),
      probeJump: (opts: unknown) => invoke('ssh_probe_jump', { opts }),
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
    },
    sftp: {
      list: (sessionId: string, remotePath: string) =>
        invoke('sftp_list', { sessionId, remotePath }),
      home: (sessionId: string) => invoke<string>('sftp_home', { sessionId }),
      download: (sessionId: string, remotePath: string, localPath: string) =>
        invoke('sftp_download', { sessionId, remotePath, localPath }),
      upload: (sessionId: string, localPath: string, remotePath: string) =>
        invoke('sftp_upload', { sessionId, localPath, remotePath }),
      mkdir: (sessionId: string, remotePath: string) =>
        invoke('sftp_mkdir', { sessionId, remotePath }),
      remove: (sessionId: string, remotePath: string) =>
        invoke('sftp_remove', { sessionId, remotePath }),
      rename: (sessionId: string, fromPath: string, toPath: string) =>
        invoke('sftp_rename', { sessionId, fromPath, toPath }),
      chmod: (sessionId: string, remotePath: string, mode: number) =>
        invoke('sftp_chmod', { sessionId, remotePath, mode }),
      readText: (sessionId: string, remotePath: string, maxBytes?: number) =>
        invoke('sftp_read_text', { sessionId, remotePath, maxBytes: maxBytes ?? null }),
      writeText: (sessionId: string, remotePath: string, content: string) =>
        invoke('sftp_write_text', { sessionId, remotePath, content }),
      pickDownloadPath: (defaultName?: string) =>
        invoke<string | null>('sftp_pick_download_path', { defaultName: defaultName ?? null }),
      pickUploadFiles: () => invoke<string[] | null>('sftp_pick_upload_files'),
      pickSavePaths: (names: string[]) => invoke<string[] | null>('sftp_pick_save_paths', { names }),
      onProgress: (cb: AnyFn) =>
        unsubListen(
          listen('sftp:progress', (e) => {
            cb(e.payload)
          })
        ),
      stat: (sessionId: string, remotePath: string) =>
        invoke('sftp_stat', { sessionId, remotePath }),
      hash: (sessionId: string, remotePath: string, maxBytes?: number) =>
        invoke<string>('sftp_hash', { sessionId, remotePath, maxBytes: maxBytes ?? null }),
      cancel: async () => false,
      transfer: (
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
        }),
      queueLoad: () => invoke('sftp_queue_load'),
      queueSave: (tasks: unknown) => invoke('sftp_queue_save', { tasks })
    },
    localFs: {
      home: () => invoke<string>('local_fs_home'),
      drives: () => invoke('local_fs_drives'),
      list: (dir?: string) => invoke('local_fs_list', { dir: dir ?? null }),
      stat: (target: string) => invoke('local_fs_stat', { target }),
      mkdir: (target: string) => invoke<boolean>('local_fs_mkdir', { target }),
      rename: (from: string, to: string) => invoke<boolean>('local_fs_rename', { from, to }),
      trash: (target: string) => invoke<{ token: string }>('local_fs_trash', { target }),
      restore: (token: string) => invoke<boolean>('local_fs_restore', { token }),
      reveal: (target: string) => invoke<boolean>('local_fs_reveal', { target }),
      open: (target: string) => invoke<string>('local_fs_open', { target }),
      hash: (target: string, maxBytes?: number) =>
        invoke<string>('local_fs_hash', { target, maxBytes: maxBytes ?? null }),
      readText: (target: string, maxBytes?: number) =>
        invoke('local_fs_read_text', { target, maxBytes: maxBytes ?? null }),
      detectKeyKind: (target: string) => invoke<string>('local_fs_detect_key_kind', { target }),
      pickPrivateKey: () => invoke<string | null>('pick_private_key'),
      pickCertificate: () => invoke<string | null>('pick_certificate')
    },
    knownHosts: {
      list: () => invoke('known_hosts_list'),
      remove: (hostPort: string) => invoke<boolean>('known_hosts_remove', { hostPort }),
      pickImport: () => invoke('known_hosts_pick_import'),
      applyImport: (rows: unknown) => invoke('known_hosts_apply_import', { rows }),
      listLocalKeys: () => invoke('local_fs_list_keys'),
      openSshDir: () => invoke<boolean>('local_fs_open_ssh_dir'),
      lookupHost: (host: string, port?: number) =>
        invoke('known_hosts_lookup_host', { host, port: port ?? null, filePath: null }),
      lookupHostsBulk: (hosts: Array<{ host: string; port?: number }>, filePath?: string | null) =>
        invoke('known_hosts_lookup_hosts_bulk', { hosts, filePath: filePath ?? null })
    },
    docker: {
      listTree: (sessionId: string) => invoke('docker_list_tree', { sessionId }),
      watchEvents: (sessionId: string) => invoke<boolean>('docker_watch_events', { sessionId }),
      unwatchEvents: (sessionId: string) => invoke<boolean>('docker_unwatch_events', { sessionId }),
      onChanged: (cb: AnyFn) =>
        unsubListen(
          listen('docker:changed', (e) => {
            cb(e.payload)
          })
        ),
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
    },
    fs: {
      pathForFile: () => '',
      writeFile: async () => false
    },
    sessions: {
      list: async () => {
        const v = await invoke<any>('sessions_list')
        return v && typeof v === 'object' ? v : emptySessions()
      },
      save: (state: unknown) => invoke('sessions_save', { value: state }),
      importPick: () => invoke('sessions_import_pick'),
      importSshConfig: (path?: string) =>
        invoke('sessions_import_ssh_config', { path: path ?? null }),
      export: (format?: string) => invoke<string>('sessions_export', { format: format ?? 'json' }),
      discoverElectronStore: () => invoke('electron_store_discover'),
      importElectronStore: () => invoke('electron_store_import')
    },
    snippets: {
      list: async () => {
        const v = await invoke<any>('store_get', { path: ['snippets'] })
        return Array.isArray(v) ? v : []
      },
      save: (list: unknown) => invoke('store_set', { path: ['snippets'], value: list })
    },
    inventory: {
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
        invoke<boolean>('core_memory_clear_working', { sessionKey }),
      listThreads: () => invoke('core_memory_list_threads'),
      bumpEpoch: (sessionKey: string) => invoke<number>('core_memory_bump_epoch', { sessionKey }),
      appendObservations: (sessionKey: string, texts: string[]) =>
        invoke('core_memory_append_observations', { sessionKey, texts }),
      appendEpisode: (sessionKey: string, text: string, tags?: string[]) =>
        invoke('core_memory_append_episode', { sessionKey, text, tags: tags ?? null }),
      setCiteHold: (sessionKey: string, markers: string[]) =>
        invoke('core_memory_set_cite_hold', { sessionKey, markers }),
      compress: (sessionKey: string, piece: string, cursor?: string) =>
        invoke('core_memory_compress', { sessionKey, piece, cursor: cursor ?? null }),

      compactTurns: (sessionKey: string, turns: unknown[], maxTurns?: number) =>
        invoke('core_memory_compact_turns', {
          sessionKey,
          turns,
          maxTurns: maxTurns ?? null
        }),
      recall: (sessionKey: string, query: string, topK?: number) =>
        invoke('core_memory_recall', { sessionKey, query, topK: topK ?? null }),
      applyCiteScrub: (sessionKey: string, text: string) =>
        invoke('core_memory_apply_cite_scrub', { sessionKey, text }),
    },
    terminal: {
      getPrefs: async () => {
        const v = await invoke<any>('store_get', { path: ['terminalPrefs'] })
        return normalizeTerminalPrefs(v)
      },
      setPrefs: async (partial: Partial<TerminalPrefs>) => {
        const cur = normalizeTerminalPrefs(await invoke<any>('store_get', { path: ['terminalPrefs'] }))
        const next = normalizeTerminalPrefs({ ...cur, ...(partial && typeof partial === 'object' ? partial : {}) })
        await invoke('store_set', { path: ['terminalPrefs'], value: next })
        return next
      }
    },
    ai: {
      getSettings: async () => invoke('store_get', { path: ['ai'] }),
      setSettings: (s: unknown) => invoke('store_set', { path: ['ai'], value: s }),
      chat: (payload: unknown) => invoke('ai_chat', { payload }),
      abortChat: async () => {
        await invoke('ai_abort_chat')
      },
      parseSsh: (text: string) => invoke('ai_parse_ssh', { text }),
      assist: (req: unknown) => invoke('ai_assist', { req }),
      abortAssist: async (requestId?: string) => {
        await invoke('ai_abort_assist', { requestId: requestId ?? null })
      },
      testProvider: (provider: unknown) => invoke('ai_test_provider', { provider }),
      resolveConfirm: (requestId: string, ok: boolean) =>
        invoke('ai_resolve_confirm', { requestId, ok }),
      /** Electron alias used by AIPanel confirm buttons */
      confirmStep: (requestId: string, ok: boolean) =>
        invoke('ai_resolve_confirm', { requestId, ok }),
      /** Electron alias — parse SSH paste into form fields */
      parseSshForm: (rawText: string) => invoke('ai_parse_ssh', { text: rawText }),
      /** Protection registry (Electron); Tauri no-ops until wired */
      setSessionProtection: (_sessionId: string, _protection: unknown) => {},
      /** Working-memory goal for AI panel header (Electron ai:workingMemory:get) */
      getWorkingMemory: async (key: string) => {
        try {
          const row = await invoke<any>('core_memory_get', { sessionKey: key })
          const goal = row?.workingMemory?.goal
          return typeof goal === 'string' && goal.trim() ? goal : null
        } catch {
          return null
        }
      },
      getChatHistory: async (key: string) => {
        const all = (await invoke<any>('store_get', { path: ['aiChatHistory'] })) || {}
        return Array.isArray(all[key]) ? all[key] : []
      },
      setChatHistory: async (key: string, msgs: unknown) => {
        const all = (await invoke<any>('store_get', { path: ['aiChatHistory'] })) || {}
        all[key] = msgs
        await invoke('store_set', { path: ['aiChatHistory'], value: all })
      },
      chatArchive: {
        list: async () => {
          const v = await invoke<any>('store_get', { path: ['aiChatArchive'] })
          return Array.isArray(v) ? v : []
        },
        add: async (row: unknown) => {
          const v = (await invoke<any>('store_get', { path: ['aiChatArchive'] })) || []
          const next = Array.isArray(v) ? [...v, row] : [row]
          await invoke('store_set', { path: ['aiChatArchive'], value: next })
        },
        take: async (id: string) => {
          const v = (await invoke<any>('store_get', { path: ['aiChatArchive'] })) || []
          const list = Array.isArray(v) ? v : []
          const hit = list.find((e: any) => e?.id === id) || null
          const next = list.filter((e: any) => e?.id !== id)
          await invoke('store_set', { path: ['aiChatArchive'], value: next })
          return hit
        },
        getChatHistory: async (key: string) => {
          const all = (await invoke<any>('store_get', { path: ['aiChatHistory'] })) || {}
          return Array.isArray(all[key]) ? all[key] : []
        }
      },
      onStream: (cb: AnyFn) =>
        unsubListen(
          listen('ai:stream', (e) => {
            cb(e.payload)
          })
        )
    },
    debug: {
      openWindow: async () => {},
      onPush: (_cb: AnyFn) => () => {}
    },
    tools: {
      processes: (sessionId: string) => invoke('tools_processes', { sessionId }),
      kill: (sessionId: string, pid: number, signal?: string, sudo?: boolean) =>
        invoke('tools_kill', { sessionId, pid, signal: signal ?? null, sudo: sudo ?? null }),
      services: (sessionId: string) => invoke('tools_services', { sessionId }),
      service: (sessionId: string, unit: string, action: string, sudo?: boolean) =>
        invoke('tools_service', { sessionId, unit, action, sudo: sudo ?? null }),
      ports: (sessionId: string) => invoke('tools_ports', { sessionId }),
      df: (sessionId: string) => invoke('tools_df', { sessionId }),
      logs: (sessionId: string, req: unknown) => invoke('tools_logs', { sessionId, req })
    },
    backup: {
      export: (raw: unknown) => invoke('backup_export', { raw }),
      import: (raw: unknown) => invoke('backup_import', { raw })
    },
    workspace: {
      ping: async () => null,
      probeHosts: async () => [],
      batchExec: (payload: unknown) => invoke('workspace_batch_exec', { payload }),
      resources: (sessionId: string) => invoke('workspace_resources', { sessionId }),
      healthProbe: (payload: unknown) => invoke('workspace_health_probe', { payload }),
      healthProbeSweep: (idleMs?: number) =>
        invoke('workspace_health_probe_sweep', { idleMs: idleMs ?? null }),
      healthProbeRelease: (profileId?: string) =>
        invoke('workspace_health_probe_release', { profileId: profileId ?? null }),
      forwards: {
        list: (sessionId?: string) =>
          invoke('forwards_list', { sessionId: sessionId ?? null }),
        add: (req: unknown) => invoke('forwards_add', { req }),
        restore: (payload: unknown) => invoke('forwards_restore', { payload }),
        remove: (id: string) => invoke<boolean>('forwards_remove', { id })
      },
      commandHistory: {
        list: async () => {
          const v = await invoke<any>('store_get', { path: ['commandHistory'] })
          return Array.isArray(v) ? v : []
        },
        push: async (command: string) => {
          const v = (await invoke<any>('store_get', { path: ['commandHistory'] })) || []
          const next = [command, ...(Array.isArray(v) ? v : [])].slice(0, 200)
          await invoke('store_set', { path: ['commandHistory'], value: next })
          return next
        },
        clear: async () => {
          await invoke('store_set', { path: ['commandHistory'], value: [] })
          return []
        }
      },
      recent: {
        list: async () => {
          const v = await invoke<any>('store_get', { path: ['recentConnections'] })
          return Array.isArray(v) ? v : []
        },
        remove: async (id: string) => {
          const v = (await invoke<any>('store_get', { path: ['recentConnections'] })) || []
          const next = (Array.isArray(v) ? v : []).filter((e: any) => e?.id !== id)
          await invoke('store_set', { path: ['recentConnections'], value: next })
          return next
        },
        pin: async (id: string, pinned: boolean) => {
          const v = (await invoke<any>('store_get', { path: ['recentConnections'] })) || []
          const next = (Array.isArray(v) ? v : []).map((e: any) =>
            e?.id === id ? { ...e, pinned } : e
          )
          await invoke('store_set', { path: ['recentConnections'], value: next })
          return next
        }
      },
      locale: {
        get: async () => {
          const v = await invoke<any>('store_get', { path: ['locale'] })
          return v === 'en-US' ? 'en-US' : 'zh-CN'
        },
        set: async (locale: string) => {
          await invoke('store_set', { path: ['locale'], value: locale })
          return locale
        }
      }
    },
    recordings: {
      list: () => invoke('recordings_list'),
      read: (file: string) => invoke<string>('recordings_read', { file }),
      delete: (file: string) => invoke<boolean>('recordings_delete', { file })
    },
    sync: {
      getConfig: () => invoke('sync_get_config'),
      setConfig: (patch: unknown) => invoke('sync_set_config', { patch }),
      test: () => invoke('sync_test'),
      push: (passphrase: string) => invoke('sync_push', { passphrase }),
      pull: (passphrase: string) => invoke('sync_pull', { passphrase }),
      backupLocal: () => invoke('sync_backup_local'),
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
    },
    files: {
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
    },
    snapshots: {
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
    }
  }

  // Warm clipboard read into a tiny sync cache for paste UX later
  try {
    const t = await readText()
    api.clipboard.readText = () => t || ''
  } catch {
    /* ignore */
  }

  ;
  // Round-10: never leave AI panel mount paths as undefined (black-screen class of bugs)
  const ai = api.ai || (api.ai = {})
  if (typeof ai.getWorkingMemory !== 'function') {
    ai.getWorkingMemory = async () => null
  }
  if (typeof ai.confirmStep !== 'function' && typeof ai.resolveConfirm === 'function') {
    ai.confirmStep = ai.resolveConfirm.bind(ai)
  }
  if (typeof ai.confirmStep !== 'function') {
    ai.confirmStep = async () => false
  }
  if (typeof ai.setSessionProtection !== 'function') {
    ai.setSessionProtection = () => {}
  }
  if (typeof ai.parseSshForm !== 'function') {
    ai.parseSshForm = (raw: string) =>
      typeof ai.parseSsh === 'function' ? ai.parseSsh(raw) : Promise.resolve({ ok: false })
  }

  (window as any).aiss = api
  console.warn('[tauri-bridge] window.aiss installed')
}
