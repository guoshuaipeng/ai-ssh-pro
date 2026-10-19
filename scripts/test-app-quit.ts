/** Quit: last window closes the app on Win/Linux; no idle keep-alive. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FORCE_EXIT_MS, shouldQuitOnAllWindowsClosed } from '../src/main/app-quit'

assert.equal(shouldQuitOnAllWindowsClosed('win32'), true)
assert.equal(shouldQuitOnAllWindowsClosed('linux'), true)
assert.equal(shouldQuitOnAllWindowsClosed('darwin'), false)
assert.equal(FORCE_EXIT_MS, 2500)

const mainSrc = readFileSync('src/main/index.ts', 'utf8')
assert.equal(mainSrc.includes('IDLE_QUIT_MS'), false, 'no 120s idle quit')
assert.equal(mainSrc.includes('scheduleIdleQuit'), false, 'no idle quit scheduler')
assert.ok(mainSrc.includes('beginQuit'))
assert.ok(mainSrc.includes('will-quit'))
assert.ok(mainSrc.includes('FORCE_EXIT_MS'))
assert.ok(mainSrc.includes('shouldQuitOnAllWindowsClosed'))
assert.match(mainSrc, /app\.on\(\s*'window-all-closed'[\s\S]*?beginQuit\(\)/)

const sparkles = readFileSync('src/shared/icon-registry.ts', 'utf8')
assert.ok(
  sparkles.includes("sparkles: 'M8 2.6 9.1 6.4 13 7.4 9.1 8.6 8 12.4 6.9 8.6 3 7.4 6.9 6.4 8 2.6Z'"),
  'sparkles path matches DataAI IconSpark'
)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.equal(toolbar.includes('ai-sparkle.png'), false)
assert.equal(toolbar.includes('aiSparkleUrl'), false)
assert.match(toolbar, /kind === 'ai'[\s\S]*?name="sparkles"/)

const iconSrc = readFileSync('src/renderer/src/components/Icon.tsx', 'utf8')
assert.match(iconSrc, /name === 'sparkles' \? '0 0 16 16'/)

console.log('test-app-quit ok')
