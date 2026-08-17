/**
 * Desktop launcher: start Electron on built out/, without `npm run preview`.
 * Retries once if nothing is running after a short wait (close→reopen race).
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const mainJs = join(root, 'out', 'main', 'index.js')

function alertBox(msg) {
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show(${JSON.stringify(msg)}, 'AI-SSH-Pro')`
      ],
      { stdio: 'ignore', windowsHide: true }
    )
  } catch {
    /* ignore */
  }
}

function runningMainElectronCount() {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -and $_.CommandLine -match 'ai-ssh-pro' -and $_.CommandLine -notmatch '--type=' }).Count`
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    return Number(String(out).trim()) || 0
  } catch {
    return 0
  }
}

function launchDetached() {
  const env = { ...process.env }
  delete env.ELECTRON_RENDERER_URL
  const child = spawn(electronExe, ['.'], {
    cwd: root,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.unref()
}

if (!existsSync(electronExe)) {
  alertBox(`未找到 Electron：\n${electronExe}\n请在项目目录执行 npm install`)
  process.exit(1)
}

if (!existsSync(mainJs)) {
  alertBox(`未找到构建产物：\n${mainJs}\n请先在项目目录执行：\nnpm run build`)
  process.exit(1)
}

launchDetached()
await sleep(650)
if (runningMainElectronCount() === 0) {
  await sleep(350)
  launchDetached()
}
