/**
 * UX lint (UX-06 / UX-07 / F4), part of `npm test`:
 *  1. no native browser dialogs (window.confirm / alert / prompt) anywhere in src — use lib/dialogs.tsx
 *  2. menu.* i18n entries exist in zh + en, follow the "…" rule identically in both languages,
 *     and match the shared menu definition (one name per feature)
 *  3. legacy terms replaced by the glossary do not come back
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHARED_MENUS } from '../src/shared/menus'
import { countNativeSelects } from '../src/shared/select-nav'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(p)
  }
}
walk(join(root, 'src'))

// 1. native dialogs
const NATIVE = /(?<![.\w])(?:window\.)?(confirm|alert|prompt)\s*\(|window\.(confirm|alert|prompt)\b/
const hits: string[] = []
for (const f of files) {
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (NATIVE.test(line)) hits.push(`${relative(root, f)}:${i + 1}: ${line.trim()}`)
    })
}
assert.deepEqual(hits, [], `native dialogs found (use confirmDialog/promptDialog/toast):\n${hits.join('\n')}`)

// 2. i18n catalogs (parsed as text so this runs without React)
const src = readFileSync(join(root, 'src/renderer/src/lib/i18n.tsx'), 'utf8')
const zhPart = src.slice(src.indexOf('const zhCN = {'), src.indexOf('} as const'))
const enPart = src.slice(src.indexOf('const en: Record<MessageKey, string> = {'), src.indexOf('const catalogs'))
const parse = (part: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const re = /\n\s*'([^']+)':\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(part))) {
    const raw = m[2]!
    out[m[1]!] = raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\'/g, "'")
  }
  return out
}
const zh = parse(zhPart)
const en = parse(enPart)
assert.ok(Object.keys(zh).length > 500 && Object.keys(en).length > 500, 'catalogs parsed')
const problems: string[] = []
for (const k of Object.keys(zh).filter((x) => x.startsWith('menu.'))) {
  if (!(k in en)) problems.push(`${k}: missing en`)
  else if (zh[k]!.endsWith('…') !== en[k]!.endsWith('…')) problems.push(`${k}: "…" differs (${zh[k]} / ${en[k]})`)
}
for (const k of Object.keys(en).filter((x) => x.startsWith('menu.'))) if (!(k in zh)) problems.push(`${k}: missing zh`)

// shared menu items: ellipsis parity, and the i18n copy (when one exists) uses the same name
const ALIAS: Record<string, string> = { connection: 'newConnection', toggleSplit: 'split', toggleBroadcast: 'broadcast', toggleRecording: 'recording' }
for (const m of SHARED_MENUS) {
  for (const it of m.items) {
    if (it.type !== 'item') continue
    if (it.label.zh.endsWith('…') !== it.label.en.endsWith('…')) problems.push(`menu item ${it.id}: "…" differs`)
    const key = `menu.${ALIAS[it.id] ?? it.id}`
    if (key in zh && zh[key] !== it.label.zh) problems.push(`${key}: zh "${zh[key]}" ≠ menu "${it.label.zh}"`)
    if (key in en && en[key] !== it.label.en) problems.push(`${key}: en "${en[key]}" ≠ menu "${it.label.en}"`)
  }
}

// 3. glossary (ux-spec §3): retired names
const RETIRED = ['文件传输', 'AI 配置', 'AI 助手调试', '切换广播输入', '开始/停止录制', 'File transfer', 'file transfer', 'Batch execute', 'AI config']
for (const [lang, cat] of [['zh', zh], ['en', en]] as const) {
  for (const [k, v] of Object.entries(cat)) for (const term of RETIRED) if (v.includes(term)) problems.push(`${lang} ${k}: retired term "${term}"`)
}
for (const m of SHARED_MENUS) for (const it of m.items) if (it.type === 'item') for (const term of RETIRED) if (it.label.zh.includes(term) || it.label.en.includes(term)) problems.push(`menu ${it.id}: retired term "${term}"`)
assert.deepEqual(problems, [], problems.join('\n'))
// UX-25: forbid non-documentation IPs in placeholders
const DOC_IP = /^(?:192\.0\.2\.\d+|198\.51\.100\.\d+|203\.0\.113\.\d+|127\.0\.0\.\d+|0\.0\.0\.0)$/
const RAW_IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/
const ipHits: string[] = []
for (const f of files) {
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const m = /placeholder\s*=\s*(?:"([^"]+)"|'([^']+)'|\{["']([^"']+)["']\})/.exec(line)
      if (!m) return
      const val = m[1] || m[2] || m[3] || ''
      const ipm = RAW_IP.exec(val)
      if (!ipm) return
      const ip = ipm[0]
      if (!DOC_IP.test(ip)) ipHits.push(`${relative(root, f)}:${i + 1}: placeholder IP ${ip}`)
    })
}
assert.deepEqual(ipHits, [], `UX-25 real IP in placeholder:\n${ipHits.join('\n')}`)

// UX-12b: no emoji / icon-pictograph leftovers in renderer tsx. Typography arrows and the more-actions ellipsis stay.
const PICTO = /\p{Extended_Pictographic}/gu
const SOLO_GLYPH = /['"`][▶▼◀►▸▾▴▹▻▲△▽◆◇■□▣▤▦⌖⌨⊘★☆⚠⏹☑]['"`]/
const iconHits: string[] = []
for (const f of files) {
  if (!f.includes(`${join('renderer', 'src')}`) || !f.endsWith('.tsx')) continue
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const pictos = [...line.matchAll(PICTO)].filter((m) => m[0] !== '⋯')
      if (pictos.length || /[★☆]/.test(line) || SOLO_GLYPH.test(line)) {
        iconHits.push(`${relative(root, f)}:${i + 1}: ${line.trim()}`)
      }
    })
}
assert.deepEqual(iconHits, [], `UX-12b emoji or icon glyph:\n${iconHits.join('\n')}`)

const bareButtons: string[] = []
const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/g
for (const f of files) {
  if (!f.includes(`${join('renderer', 'src')}`) || !f.endsWith('.tsx')) continue
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(buttonRe)) {
    const open = m[1] ?? ''
    const inner = m[2] ?? ''
    if (!/<Icon\b|<Twist\b|<svg\b/.test(inner)) continue
    const textOnly = inner.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, '').replace(/⋯/g, '')
    if (textOnly.length) continue
    if (/\btitle=/.test(open) || /\baria-label=/.test(open)) continue
    const line = text.slice(0, m.index ?? 0).split('\n').length
    bareButtons.push(`${relative(root, f)}:${line}: icon-only button needs title or aria-label`)
  }
}
assert.deepEqual(bareButtons, [], `UX-12b icon-only without tooltip:\n${bareButtons.join('\n')}`)

console.log(`check-ux ok: ${files.length} files without native dialogs, ${Object.keys(zh).filter((x) => x.startsWith('menu.')).length} menu.* entries consistent`)

// 4. C2: native <select> budget only goes down. Lower the baseline when you replace one.
{
  const baseline = JSON.parse(readFileSync(join(root, 'scripts/native-select-baseline.json'), 'utf8')).count as number
  let count = 0
  for (const f of files) if (f.includes(join('src', 'renderer'))) count += countNativeSelects(readFileSync(f, 'utf8'))
  assert.ok(count <= baseline, `native <select> count rose to ${count} (baseline ${baseline}); use components/ui/Select`)
  assert.ok(count >= baseline, `native <select> count fell to ${count}; lower scripts/native-select-baseline.json to ${count}`)
}
