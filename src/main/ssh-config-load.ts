import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import {
  expandSshConfigIncludes,
  parseOpenSshConfig,
  type SshConfigParseResult
} from '../shared/ssh-config-import'

function readText(absPath: string): string | null {
  try {
    if (!existsSync(absPath) || !statSync(absPath).isFile()) return null
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

function listNames(absDir: string): string[] {
  try {
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) return []
    return readdirSync(absDir)
  } catch {
    return []
  }
}

/** Load an OpenSSH config file with bounded, allowlisted Include expansion. */
export function loadAndParseSshConfigFile(filePath: string): SshConfigParseResult & {
  expandNotes: string[]
} {
  const abs = resolve(filePath)
  const home = homedir()
  const entryText = readText(abs)
  if (entryText == null) {
    return {
      drafts: [],
      notes: [`cannot read ${abs}`],
      skippedWildcard: 0,
      includeCount: 0,
      matchCount: 0,
      includedFiles: [],
      skippedIncludes: [],
      expandNotes: [`cannot read ${abs}`]
    }
  }
  const expanded = expandSshConfigIncludes(entryText, {
    homeDir: home,
    entryPath: abs,
    readText,
    listNames,
    resolve: (...parts: string[]) => resolve(...parts),
    dirname,
    isAbsolute
  })
  const parsed = parseOpenSshConfig(expanded.text, { homeDir: home, group: 'OpenSSH' })
  const expandNotes: string[] = []
  if (expanded.includedFiles.length) {
    expandNotes.push(`Include inlined ${expanded.includedFiles.length} file(s)`)
  }
  for (const s of expanded.skipped) {
    expandNotes.push(`Include skipped (${s.reason}): ${s.path}`)
  }
  return {
    ...parsed,
    includeCount: expanded.includeDirectiveCount,
    includedFiles: expanded.includedFiles,
    skippedIncludes: expanded.skipped,
    notes: [...parsed.notes.filter((n) => !n.startsWith('Include×')), ...expandNotes],
    expandNotes
  }
}

export function defaultSshConfigPath(): string {
  return join(homedir(), '.ssh', 'config')
}
