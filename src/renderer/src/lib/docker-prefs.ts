/** Docker 面板偏好（所有容器 / Swarm 服务共用），持久化到 localStorage */

export type DockerPrefs = {
  /** 是否展开配置区；默认显示 */
  showConfig: boolean
}

const KEY = 'aiss-docker-prefs-v1'

export const DOCKER_PREFS_DEFAULTS: DockerPrefs = {
  showConfig: true
}

export function loadDockerPrefs(): DockerPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DOCKER_PREFS_DEFAULTS }
    const o = JSON.parse(raw) as Partial<DockerPrefs>
    return {
      showConfig: typeof o.showConfig === 'boolean' ? o.showConfig : DOCKER_PREFS_DEFAULTS.showConfig
    }
  } catch {
    return { ...DOCKER_PREFS_DEFAULTS }
  }
}

export function saveDockerPrefs(prefs: DockerPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / private mode */
  }
}
