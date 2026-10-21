import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Static import is hoisted above the env setup below, exactly like test-core-a-evals.
import { loadPersistedCoreSession, savePersistedCoreSession } from '../src/main/core-a-memory.ts'

const dir = mkdtempSync(join(tmpdir(), 'core-mem-iso-'))
process.env.AISS_CORE_MEMORY_CWD = dir
savePersistedCoreSession('iso-1', { notes: ['n'], recentCommands: ['uptime'], observations: [], taskGraph: [] })
assert.deepEqual(loadPersistedCoreSession('iso-1')?.recentCommands, ['uptime'])
// The store must live in this process's dir, not a tmp dir shared with parallel test processes.
assert.ok(readdirSync(dir).length > 0, 'store written to AISS_CORE_MEMORY_CWD')
console.log('test-core-memory-isolation ok')