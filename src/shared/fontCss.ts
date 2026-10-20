/**
 * 安装包瘦身（路线图 1.5）：@fontsource CSS 同时声明 woff2 与 woff，Electron 的 Chromium 只会用 woff2，
 * woff 回退会被 Vite 原样打包（约 5 MB）。此函数删掉 @font-face src 中的 woff 回退。
 * 只在一条 src 内同时存在 woff2 时才删除，避免把唯一的字体来源删掉。
 */
export function stripWoffFallback(css: string): string {
  return css.replace(/src:\s*([^;]+);/g, (whole, list: string) => {
    if (!/format\(['"]woff2['"]\)/.test(list)) return whole
    const kept = list
      .split(/,\s*(?=url\()/)
      .filter((part) => !/format\(['"]woff['"]\)/.test(part))
    return `src: ${kept.join(', ')};`
  })
}
