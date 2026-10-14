import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { tg } from '../lib/i18n'

type Props = {
  markdown: string
  className?: string
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
          table: ({ children, ...props }) => (
            <div className="md-table-wrap">
              <table {...props}>{children}</table>
            </div>
          )
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
