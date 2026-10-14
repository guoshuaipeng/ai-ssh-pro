import type { Client, ClientChannel } from 'ssh2'
import { BATCH_MAX_OUTPUT_BYTES } from '../shared/workspace-features'

export type BoundedExecResult = {
  code: number | null
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
}

/**
 * Run one command on an already-connected ssh2 Client (same exec channel as docker-manager sshExec).
 * Caps output and cancels the channel on timeout so a noisy command cannot hang the batch.
 */
export function execBounded(
  client: Client,
  command: string,
  timeoutMs: number,
  maxBytes: number = BATCH_MAX_OUTPUT_BYTES
): Promise<BoundedExecResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (result: BoundedExecResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      reject(err)
    }

    let stream: ClientChannel | null = null
    try {
      client.exec(command, (err, opened) => {
        if (err || !opened) {
          fail(err ?? new Error('exec-failed'))
          return
        }
        stream = opened
        let stdout = ''
        let stderr = ''
        let truncated = false

        const take = (current: string, chunk: Buffer): string => {
          if (current.length >= maxBytes) {
            truncated = true
            return current
          }
          const text = chunk.toString('utf8')
          const next = current + text
          if (next.length <= maxBytes) return next
          truncated = true
          return next.slice(0, maxBytes)
        }

        const stop = () => {
          try {
            stream?.close()
          } catch {
            /* ignore */
          }
          try {
            stream?.destroy()
          } catch {
            /* ignore */
          }
        }

        const timer = setTimeout(() => {
          stop()
          finish({ code: null, stdout, stderr, truncated, timedOut: true })
        }, timeoutMs)

        opened.on('data', (chunk: Buffer) => {
          stdout = take(stdout, chunk)
        })
        opened.stderr?.on('data', (chunk: Buffer) => {
          stderr = take(stderr, chunk)
        })
        opened.on('error', (streamErr: Error) => {
          clearTimeout(timer)
          fail(streamErr)
        })
        opened.on('close', (code: number | null) => {
          clearTimeout(timer)
          finish({ code: code ?? 0, stdout, stderr, truncated, timedOut: false })
        })
      })
    } catch (e) {
      fail(e instanceof Error ? e : new Error('exec-failed'))
    }
  })
}
