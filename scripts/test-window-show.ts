/** Cold-start window show fallback and single-instance reopen guard. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import {
  attachShowFallback,
  SECOND_INSTANCE_CREATE_DEBOUNCE_MS,
  shouldCreateOnSecondInstance
} from '../src/main/window-show'

class FakeContents extends EventEmitter {}

class FakeWin extends EventEmitter {
  webContents = new FakeContents()
  shown = 0
  destroyed = false
  show(): void {
    this.shown += 1
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

{
  const win = new FakeWin()
  attachShowFallback(win, { timeoutMs: 500 })
  win.webContents.emit('did-finish-load')
  assert.equal(win.shown, 1)
  win.emit('ready-to-show')
  win.webContents.emit('did-finish-load')
  assert.equal(win.shown, 1, 'did-finish-load shows once')
}

{
  const win = new FakeWin()
  attachShowFallback(win, { timeoutMs: 40 })
  await wait(80)
  assert.equal(win.shown, 1, 'timeout shows when neither event fires')
  win.emit('ready-to-show')
  assert.equal(win.shown, 1, 'timeout path does not show twice')
}

{
  const win = new FakeWin()
  win.destroyed = true
  attachShowFallback(win, { timeoutMs: 500 })
  win.webContents.emit('did-finish-load')
  win.emit('ready-to-show')
  assert.equal(win.shown, 0, 'destroyed window is not shown')
}

{
  const win = new FakeWin()
  attachShowFallback(win, { timeoutMs: 40 })
  win.emit('closed')
  win.destroyed = true
  await wait(80)
  win.emit('ready-to-show')
  assert.equal(win.shown, 0, 'closed window is not shown later')
}

{
  const win = new FakeWin()
  attachShowFallback(win, { timeoutMs: 500 })
  win.emit('close')
  win.webContents.emit('did-finish-load')
  assert.equal(win.shown, 0, 'close then did-finish-load does not show')
}

{
  const win = new FakeWin()
  attachShowFallback(win, { timeoutMs: 40 })
  win.emit('close')
  await wait(80)
  win.emit('ready-to-show')
  assert.equal(win.shown, 0, 'close aborts the timeout show')
}

{
  const closedAt = 10_000
  assert.equal(SECOND_INSTANCE_CREATE_DEBOUNCE_MS, 1500)
  assert.equal(
    shouldCreateOnSecondInstance(closedAt, closedAt + 1499),
    false,
    'within 1.5s after close, do not create'
  )
  assert.equal(shouldCreateOnSecondInstance(closedAt, closedAt), false)
  assert.equal(
    shouldCreateOnSecondInstance(closedAt, closedAt + 1500),
    true,
    'at 1.5s a deliberate reopen still creates'
  )
  assert.equal(shouldCreateOnSecondInstance(closedAt, closedAt + 2000), true)
  assert.equal(shouldCreateOnSecondInstance(null, closedAt), true, 'cold start still creates')
}

{
  const mainSrc = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const showSrc = readFileSync(new URL('../src/main/window-show.ts', import.meta.url), 'utf8')
  const lockCalls = mainSrc.match(/requestSingleInstanceLock\s*\(/g) ?? []
  assert.equal(lockCalls.length, 1, 'requestSingleInstanceLock is called once')
  assert.equal(mainSrc.includes('retryLock'), false, 'startup must not retry the notifying lock')
  assert.equal(showSrc.includes('retryLock'), false, 'retryLock is not a lock helper')
  const failBranch = mainSrc.slice(mainSrc.indexOf('gotSingleInstanceLock'))
  assert.match(failBranch, /if\s*\(\s*!gotSingleInstanceLock\s*\)\s*\{[\s\S]*?app\.exit\(\s*0\s*\)/)
  assert.match(mainSrc, /lastWindowClosedAt\s*=\s*Date\.now\(\)/)
  assert.match(mainSrc, /shouldCreateOnSecondInstance\(\s*lastWindowClosedAt\s*,\s*Date\.now\(\)\s*\)/)
}

console.log('window-show ok')
