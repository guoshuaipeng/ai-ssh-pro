import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { tg } from '../lib/i18n'

type Props = {
  markdown: string
  className?: string
}

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (typeof node === 'object' && node && 'props' in node) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

/** 运维备注 Markdown 预览（GFM：表格 / 任务列表 / 删除线等） */
export default function NotesMarkdownPreview({ markdown, className }: Props) {
  const src = markdown.trim()
  if (!src) {
    return (
      <div className={`notes-preview md-body ${className ?? ''}`.trim()}>
        <p className="md-empty">{tg('ui.257')}</p>
      </div>
    )
  }

  let h2i = 0
  return (
    <div className={`notes-preview md-body ${className ?? ''}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noreferrer" {...props}>
              {children}
            </a>
          ),
          h2: ({ children }) => {
            const id = `hp-h2-${h2i++}`
            return <h2 id={id}>{children}</h2>
          },
          table: ({ children, ...props }) => (
            <div className="md-table-wrap">
              <table {...props}>{children}</table>
            </div>
          ),
          pre: ({ children }) => {
            const text = nodeText(children)
            return (
              <div className="md-pre-wrap">
                <button
                  type="button"
                  className="md-pre-copy"
                  onClick={() => void navigator.clipboard.writeText(text)}
                >
                  {tg('hp.copyCode')}
                </button>
                <pre>{children}</pre>
              </div>
            )
          }
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
