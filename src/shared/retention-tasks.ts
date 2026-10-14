/** G3: dismissible getting-started cards after the welcome tour. */
export type TaskId = 'connect' | 'monitor' | 'ai' | 'transfer'

export const TASK_IDS: readonly TaskId[] = ['connect', 'monitor', 'ai', 'transfer']

export type TaskState = {
  done: Partial<Record<TaskId, boolean>>
  skipped: Partial<Record<TaskId, boolean>>
  dismissedForever: boolean
}

export const TASKS_LS_KEY = 'aiss.tasks.v1'

export function loadTaskState(store: Pick<Storage, 'getItem'> = globalThis.localStorage): TaskState {
  try {
    const raw = store.getItem(TASKS_LS_KEY)
    if (!raw) return { done: {}, skipped: {}, dismissedForever: false }
    const o = JSON.parse(raw) as Partial<TaskState>
    const done: TaskState['done'] = {}
    const skipped: TaskState['skipped'] = {}
    for (const id of TASK_IDS) {
      if (o.done?.[id]) done[id] = true
      if (o.skipped?.[id]) skipped[id] = true
    }
    return { done, skipped, dismissedForever: Boolean(o.dismissedForever) }
  } catch {
    return { done: {}, skipped: {}, dismissedForever: false }
  }
}

export function saveTaskState(state: TaskState, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  store.setItem(TASKS_LS_KEY, JSON.stringify(state))
}

export function completeTask(id: TaskId, store?: Pick<Storage, 'getItem' | 'setItem'>): TaskState {
  const cur = loadTaskState(store)
  if (cur.done[id]) return cur
  const next = { ...cur, done: { ...cur.done, [id]: true } }
  saveTaskState(next, store)
  return next
}

export function skipTask(id: TaskId, store?: Pick<Storage, 'getItem' | 'setItem'>): TaskState {
  const cur = loadTaskState(store)
  const next = { ...cur, skipped: { ...cur.skipped, [id]: true } }
  saveTaskState(next, store)
  return next
}

export function dismissTasksForever(store?: Pick<Storage, 'getItem' | 'setItem'>): TaskState {
  const next = { ...loadTaskState(store), dismissedForever: true }
  saveTaskState(next, store)
  return next
}

/** Help → reopen. Completion stays; per-card skips and the permanent dismiss are cleared. */
export function reopenTasks(store?: Pick<Storage, 'getItem' | 'setItem'>): TaskState {
  const next = { ...loadTaskState(store), skipped: {}, dismissedForever: false }
  saveTaskState(next, store)
  return next
}

export function pendingTasks(state: TaskState): TaskId[] {
  return TASK_IDS.filter((id) => !state.done[id] && !state.skipped[id])
}
