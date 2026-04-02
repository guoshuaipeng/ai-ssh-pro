/** 按行环形缓冲，供 Agent /「最近输出」读取 */
export class RingBuffer {
  private lines: string[] = []
  private partial = ''

  constructor(private readonly maxLines: number) {}

  appendUtf8(chunk: string): void {
    this.partial += chunk
    const parts = this.partial.split('\n')
    this.partial = parts.pop() ?? ''
    for (const line of parts) {
      this.lines.push(line)
      if (this.lines.length > this.maxLines) {
        this.lines.splice(0, this.lines.length - this.maxLines)
      }
    }
  }

  /** 连接关闭时把尾部不完整行写入 */
  flushPartial(): void {
    if (this.partial.length > 0) {
      this.lines.push(this.partial)
      this.partial = ''
      if (this.lines.length > this.maxLines) {
        this.lines.splice(0, this.lines.length - this.maxLines)
      }
    }
  }

  getSnapshot(maxLines = 200): string {
    const n = Math.min(maxLines, this.lines.length)
    return this.lines.slice(-n).join('\n')
  }

  clear(): void {
    this.lines = []
    this.partial = ''
  }
}
