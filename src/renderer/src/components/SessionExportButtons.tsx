import { useState } from 'react'
import type { SessionExportFormat } from '@shared/ipc'

type SessionsExportApi = {
  export: (format: SessionExportFormat) => Promise<string>
}

function getExportApi(): SessionsExportApi['export'] {
  const sessions = window.aiss.sessions as typeof window.aiss.sessions & Partial<SessionsExportApi>
  if (!sessions.export) {
    throw new Error('sessions.export 尚未接线（Phase2：window.aiss.sessions.export）')
  }
  return sessions.export.bind(sessions)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function downloadText(content: string, format: SessionExportFormat): void {
  const filename = format === 'json' ? 'ai-ssh-sessions.json' : 'ai-ssh-config'
  const mime = format === 'json' ? 'application/json' : 'text/plain'
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type Props = {
  /** 可选：导出完成后回调 */
  onExported?: (format: SessionExportFormat, content: string) => void
}

/** 导出已保存会话为 OpenSSH config / JSON（不含密码）；复制或下载 */
export default function SessionExportButtons({ onExported }: Props) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState('')
  const [lastFormat, setLastFormat] = useState<SessionExportFormat | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runExport = async (format: SessionExportFormat) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const content = await getExportApi()(format)
      setPreview(content)
      setLastFormat(format)
      const copied = await copyText(content)
      setMessage(copied ? `已导出并复制到剪贴板（${format}）` : `已导出（${format}），可手动复制下方内容`)
      onExported?.(format, content)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <button
          type="button"
          className="session-toolbar-btn"
          disabled={busy}
          onClick={() => void runExport('openssh')}
        >
          导出 OpenSSH
        </button>
        <button
          type="button"
          className="session-toolbar-btn"
          disabled={busy}
          onClick={() => void runExport('json')}
        >
          导出 JSON
        </button>
        {preview && lastFormat ? (
          <button
            type="button"
            className="session-toolbar-btn"
            disabled={busy}
            onClick={() => downloadText(preview, lastFormat)}
          >
            下载文件
          </button>
        ) : null}
      </div>
      {message ? (
        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--muted)' }}>{message}</p>
      ) : null}
      {error ? (
        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--danger, #f85149)' }}>{error}</p>
      ) : null}
      {preview ? (
        <textarea
          readOnly
          value={preview}
          rows={8}
          aria-label="导出内容预览"
          style={{ width: '100%', resize: 'vertical', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
        />
      ) : null}
    </div>
  )
}

/** 供非组件场景直接调用（Phase2 可选用） */
export async function exportSessionsContent(format: SessionExportFormat): Promise<string> {
  return getExportApi()(format)
}

export async function exportSessionsAndCopy(format: SessionExportFormat): Promise<string> {
  const content = await exportSessionsContent(format)
  await copyText(content)
  return content
}
