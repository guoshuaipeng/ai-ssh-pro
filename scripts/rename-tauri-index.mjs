import { renameSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
const dir = resolve('dist-tauri')
const from = resolve(dir, 'index.tauri.html')
const to = resolve(dir, 'index.html')
if (existsSync(from)) {
  renameSync(from, to)
  console.log('[tauri] renamed index.tauri.html -> index.html')
} else if (existsSync(to)) {
  console.log('[tauri] index.html already present')
} else {
  console.error('[tauri] neither index.tauri.html nor index.html found in dist-tauri')
  process.exit(1)
}
