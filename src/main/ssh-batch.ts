import type { Client, ClientChannel } from 'ssh2'
import { StringDecoder } from 'node:string_decoder'
import { BATCH_MAX_OUTPUT_BYTES, stripAnsi } from '../shared/workspace-features'

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
        let truncated = false
        // Collect raw bytes and decode once so multi-byte UTF-8 (e.g. Chinese) split across chunks stays intact.
        const makeSink = () => ({ chunks: [] as Buffer[], bytes: 0 })
        const out = makeSink()
        const err2 = makeSink()
        const take = (sink: ReturnType<typeof makeSink>, chunk: Buffer) => {
          const room = maxBytes - sink.bytes
          if (room <= 0) {
            truncated = true
            return
          }
          const part = chunk.length > room ? chunk.subarray(0, room) : chunk
          if (part.length < chunk.length) truncated = true
          sink.chunks.push(part)
          sink.bytes += part.length
        }
        const text = (sink: ReturnType<typeof makeSink>) => {
          const dec = new StringDecoder('utf8')
          // end() would emit U+FFFD for a cut-off trailing sequence; drop it instead.
          return stripAnsi(dec.write(Buffer.concat(sink.chunks)))
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
          finish({ code: null, stdout: text(out), stderr: text(err2), truncated, timedOut: true })
        }, timeoutMs)

        opened.on('data', (chunk: Buffer) => {
          take(out, chunk)
        })
        opened.stderr?.on('data', (chunk: Buffer) => {
          take(err2, chunk)
        })
        opened.on('error', (streamErr: Error) => {
          clearTimeout(timer)
          fail(streamErr)
        })
        opened.on('close', (code: number | null) => {
          clearTimeout(timer)
          finish({ code: code ?? 0, stdout: text(out), stderr: text(err2), truncated, timedOut: false })
        })
      })
    } catch (e) {
      fail(e instanceof Error ? e : new Error('exec-failed'))
    }
  })
}
