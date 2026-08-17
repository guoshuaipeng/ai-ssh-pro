type Props = {
  value: string
  onChange: (v: string) => void
}

/** 侧栏会话搜索输入 */
export default function SessionSearchBar({ value, onChange }: Props) {
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索会话 / 容器（名称 / 主机 / 用户）"
        aria-label="搜索会话或容器"
        style={{ width: '100%' }}
      />
    </div>
  )
}
