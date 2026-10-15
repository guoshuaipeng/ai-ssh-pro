/** Cold-start window show fallback and single-instance lock retry. */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { attachShowFallback, retryLock } from '../src/main/window-show'

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
  let calls = 0
  const waits: number[] = []
  const ok = retryLock(
    () => {
      calls += 1
      return calls === 3
    },
    (ms) => waits.push(ms),
    10,
    300
  )
  assert.equal(ok, true)
  assert.equal(calls, 3)
  assert.deepEqual(waits, [300, 300])
}

{
  let calls = 0
  const ok = retryLock(
    () => {
      calls += 1
      return false
    },
    () => {},
    4,
    300
  )
  assert.equal(ok, false)
  assert.equal(calls, 4)
}

console.log('window-show ok')
