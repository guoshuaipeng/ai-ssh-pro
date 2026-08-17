/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 终端内 Zmodem（sz / rz）探测与传文件。
 * 远端需安装 lrzsz：`sz file` 下载到本机；`rz` 从本机上传。
 */

export type ZmodemAttach = {
  /** 把 SSH 收到的原始字节喂给 sentry；返回是否已由 Zmodem 消费（勿再写 xterm） */
  consume: (octets: Uint8Array) => boolean
  dispose: () => void
}

type TerminalWriter = (data: string | Uint8Array) => void
type PeerSender = (data: Uint8Array) => void

function concatUint8(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function pickLocalFiles(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    input.onchange = () => {
      resolve(input.files)
      input.remove()
    }
    input.oncancel = () => {
      resolve(null)
      input.remove()
    }
    document.body.appendChild(input)
    input.click()
  })
}

async function loadZmodem(): Promise<any> {
  // zmodem_browser 依赖 CommonJS；Vite 下用默认入口
  const mod = await import('zmodem.js')
  return (mod as any).default ?? mod
}

export async function attachZmodem(opts: {
  writeToTerminal: TerminalWriter
  sendToPeer: PeerSender
  onStatus?: (text: string) => void
}): Promise<ZmodemAttach> {
  const Zmodem = await loadZmodem()
  let active = false
  let disposed = false

  const sentry = new Zmodem.Sentry({
    to_terminal(octets: number[] | Uint8Array) {
      if (disposed) return
      const u8 = octets instanceof Uint8Array ? octets : Uint8Array.from(octets)
      opts.writeToTerminal(u8)
    },
    sender(octets: number[] | Uint8Array) {
      if (disposed) return
      const u8 = octets instanceof Uint8Array ? octets : Uint8Array.from(octets)
      opts.sendToPeer(u8)
    },
    on_retract() {
      active = false
      opts.onStatus?.('')
    },
    on_detect(detection: any) {
      active = true
      const zsession = detection.confirm()
      opts.onStatus?.(zsession.type === 'send' ? 'Zmodem：请选择要上传的文件…' : 'Zmodem：接收文件…')

      if (zsession.type === 'send') {
        // 远端 rz → 本机发送
        void (async () => {
          try {
            const files = await pickLocalFiles()
            if (!files?.length) {
              try {
                zsession.close?.()
              } catch {
                /* ignore */
              }
              active = false
              opts.onStatus?.('已取消上传')
              return
            }
            await Zmodem.Browser.send_files(zsession, files, {
              on_progress(_file: File, xfer: any) {
                try {
                  const d = xfer.get_offset?.() ?? 0
                  const t = xfer.get_details?.()?.size ?? 0
                  if (t > 0) opts.onStatus?.(`Zmodem 上传 ${Math.round((d / t) * 100)}%`)
                } catch {
                  /* ignore */
                }
              }
            })
            opts.onStatus?.('Zmodem 上传完成')
          } catch (e) {
            opts.onStatus?.(e instanceof Error ? e.message : String(e))
          } finally {
            active = false
          }
        })()
        return
      }

      // 远端 sz → 本机接收
      zsession.on('offer', (xfer: any) => {
        void (async () => {
          try {
            const detail = xfer.get_details?.() || {}
            const name = String(detail.name || 'download.bin')
            const local = await window.aiss.sftp.pickDownloadPath(name)
            if (!local) {
              xfer.skip()
              return
            }
            opts.onStatus?.(`Zmodem 下载 ${name}…`)
            await xfer.accept()
            const payloads = (xfer.get_payloads?.() || []) as Uint8Array[]
            const bytes = concatUint8(payloads.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p as any))))
            await (window.aiss as any).fs.writeFile(local, Array.from(bytes))
            opts.onStatus?.(`Zmodem 已保存 ${name}`)
          } catch (e) {
            try {
              xfer.skip()
            } catch {
              /* ignore */
            }
            opts.onStatus?.(e instanceof Error ? e.message : String(e))
          }
        })()
      })

      zsession.on('session_end', () => {
        active = false
      })

      try {
        zsession.start()
      } catch (e) {
        active = false
        opts.onStatus?.(e instanceof Error ? e.message : String(e))
      }
    }
  })

  return {
    consume(octets: Uint8Array) {
      if (disposed) return false
      try {
        sentry.consume(octets)
        return active
      } catch {
        return false
      }
    },
    dispose() {
      disposed = true
      active = false
    }
  }
}
