import type { DockerTreeResult, SavedSessionProfile } from '@shared/ipc'
import { searchTokens } from '../../../shared/workspace-features'

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

function matches(value: string | undefined, q: string): boolean {
  return Boolean(value && value.toLowerCase().includes(q))
}

/** 会话自身字段（名称 / 主机 / 用户）是否命中 */
export function profileMatches(p: SavedSessionProfile, q: string): boolean {
  const tags = p.tags ?? []
  // "#tag" matches tags only (prefix); plain tokens also look at tags
  if (q.startsWith('#')) {
    const t = q.slice(1)
    return t ? tags.some((x) => x.toLowerCase().startsWith(t)) : tags.length > 0
  }
  return (
    tags.some((x) => x.toLowerCase().includes(q)) ||
    matches(p.label, q) ||
    matches(p.host, q) ||
    matches(p.username, q) ||
    matches(`${p.username}@${p.host}:${p.port}`, q)
  )
}

/** 已加载到树上的容器 / compose 项目是否命中；未展开过的主机没有数据，自然不参与匹配 */
export function treeMatches(tree: DockerTreeResult | undefined, q: string): boolean {
  if (!tree) return false
  if (tree.containers.some((c) => matches(c.name, q) || matches(c.image, q))) return true
  return tree.composeProjects.some(
    (p) =>
      matches(p.name, q) ||
      p.containers.some((c) => matches(c.name, q) || matches(c.composeService, q) || matches(c.image, q))
  )
}

/**
 * 按 label / host / username 过滤已保存会话；
 * 传入 getTree 时，已加载的 Docker 容器名也参与匹配。
 */
export function filterProfiles(
  profiles: SavedSessionProfile[],
  query: string,
  getTree?: (p: SavedSessionProfile) => DockerTreeResult | undefined
): SavedSessionProfile[] {
  const tokens = searchTokens(query)
  if (!tokens.length) return profiles
  // every whitespace-separated token must hit (label / host / user / user@host:port / loaded containers)
  return profiles.filter((p) => tokens.every((q) => profileMatches(p, q) || treeMatches(getTree?.(p), q)))
}

/** Folder name matched by all tokens: show the whole folder. */
export function folderMatches(name: string, query: string): boolean {
  const tokens = searchTokens(query)
  if (!tokens.length) return false
  const n = name.toLowerCase()
  return tokens.every((t) => n.includes(t))
}
