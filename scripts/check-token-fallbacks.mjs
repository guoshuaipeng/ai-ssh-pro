#!/usr/bin/env node
/**
 * UI-N1 gate: no `var(--token, #hex)` false fallbacks in renderer sources.
 * Tailwind-ish stand-ins (#3b82f6, #22c55e, #f59e0b, #161a20, #1d222a, #2a3039, #111, …)
 * must not sit behind a custom property. Undefined tokens use mapped aliases.
 *
 *   npm run check:tokens
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FALLBACK = /var\(\s*(--[A-Za-z0-9-]+)\s*,\s*(#[0-9A-Fa-f]{3,8})\b/g

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(css|tsx|ts)$/.test(name)) files.push(p)
  }
}
walk(join(root, 'src'))

const hits = []
for (const file of files) {
  const body = readFileSync(file, 'utf8')
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    FALLBACK.lastIndex = 0
    let m
    while ((m = FALLBACK.exec(lines[i]))) {
      hits.push(`${relative(root, file)}:${i + 1}: var(${m[1]}, ${m[2]})`)
    }
  }
}

if (hits.length) {
  console.error(`UI-N1 false-fallback hexes (${hits.length}):\n${hits.join('\n')}`)
  process.exit(1)
}

console.log(`check-token-fallbacks ok (${files.length} files, 0 var(--token, #hex))`)
