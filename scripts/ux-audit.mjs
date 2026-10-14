#!/usr/bin/env node
/**
 * UX-33 release gate (static phase):
 *  - fail if titlebar/search CSS allows wrapping for toolbar labels
 *  - fail if example IPs that look real appear in src placeholders (non-docs)
 *  - fail if "Error invoking" is rendered without friendlyError helper nearby in same file (heuristic)
 * Full screenshot WRAP/CLIP/OFFSCREEN checks run inside e2e when AISS_UX_AUDIT=1.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const problems = []
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|css|mjs)$/.test(name)) out.push(p)
  }
  return out
}
const files = walk(join(root, 'src'))

for (const f of files) {
  const body = readFileSync(f, 'utf8')
  const rel = relative(root, f)
  // forbid non-documentation private-looking IPs in placeholders (allow 192.0.2.x / 203.0.113.x / 198.51.100.x / example.com)
  if (/\.(tsx|ts)$/.test(f) && !rel.includes('demo-host') && !rel.includes('test-')) {
    const re = /(?:placeholder|示例|example)[^\\n]{0,40}?(1\d{2}\.\d{1,3}\.\d{1,3}\.\d{1,3})/gi
    let m
    while ((m = re.exec(body))) {
      const ip = m[1]
      if (/^192\.0\.2\.|^203\.0\.113\.|^198\.51\.100\.|^127\.|^0\./.test(ip)) continue
      problems.push(`${rel}: suspicious placeholder IP ${ip}`)
    }
  }
  if (body.includes("Error invoking remote method") && !body.includes('friendlyError') && !rel.includes('friendly-error')) {
    // allow comments
    const live = body.split('\n').filter((l) => l.includes("Error invoking") && !l.trim().startsWith('//') && !l.includes('*'))
    if (live.length) problems.push(`${rel}: raw IPC error string without friendlyError`)
  }
}

const css = readFileSync(join(root, 'src/renderer/src/styles.css'), 'utf8') + readFileSync(join(root, 'src/renderer/src/features.css'), 'utf8')
if (!/titlebar-compact-/.test(css)) problems.push('features.css missing UX-17 titlebar-compact rules')
if (!/\.tb-label-keep/.test(css)) problems.push('missing tb-label-keep (UX-23a)')

if (problems.length) {
  console.error('ux-audit FAILED:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('ux-audit ok (static)')
