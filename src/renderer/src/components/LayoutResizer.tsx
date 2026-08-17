import { useCallback, useEffect, useRef } from 'react'

type Props = {
  /** 拖动时回调：向右为正（px） */
  onDrag: (deltaX: number) => void
  title?: string
}

/** 水平拖拽分隔条 */
export default function LayoutResizer({ onDrag, title = '拖动调整宽度' }: Props) {
  const dragging = useRef(false)
  const lastX = useRef(0)
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - lastX.current
      lastX.current = e.clientX
      if (dx !== 0) onDragRef.current(dx)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.classList.remove('layout-resizing')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const onMouseDown = useCallback((e: { preventDefault: () => void; clientX: number }) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX
    document.body.classList.add('layout-resizing')
  }, [])

  return (
    <div
      className="layout-resizer"
      role="separator"
      aria-orientation="vertical"
      title={title}
      onMouseDown={onMouseDown}
    />
  )
}
