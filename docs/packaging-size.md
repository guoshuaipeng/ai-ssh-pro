# 安装包体积调查（v0.7.0）

对照近期公开发包：Windows NSIS 约 **176 MB**，macOS DMG 约 **194 MB**，Linux AppImage 约 **204 MB**。本仓库 Linux 解压目录（`release/linux-unpacked`）约 **405 MB**，其中 `app.asar` 约 115 MB。

## 体积从哪来

| 部分 | 约数 | 说明 |
| --- | --- | --- |
| Electron / Chromium | 150–220 MB（安装包压缩后仍是大头） | `node_modules/electron/dist` 约 263 MB。语言包 `locales/` 单独约 **40 MB**（55 个 `.pak`） |
| 应用 asar | ~115 MB | 渲染资源 + 外部化的 Node 依赖 |
| 原生模块（unpacked） | ~28 MB | `ssh2` / `cpu-features` / 可选 `node-pty` |
| Noto Sans SC | 构建后约 **8 MB**（woff+woff2 × 400/500/600） | 中文界面必需；`node_modules` 里整包 76 MB，已只打子集 |
| Inter + JetBrains Mono | ~1 MB | 拉丁字体 |
| 业务 JS/CSS | ~3.3 MB | React 应用包 |

没有 `electron-updater`，没有把整个 `node_modules` 打进安装包（`build.files` 只有 `out/**/*`）。体积大主要是 **Electron 运行时**，不是业务代码膨胀。

## 已落地的低风险项

1. **`electronLanguages: ["en-US", "zh-CN"]`** — 丢掉其余 50+ 个 Chromium 语言包（约 40 MB 未压缩，安装包可少十几到几十 MB）。界面只用中英。
2. **`compression: "maximum"`** — 提高 NSIS / 7z / AppImage 压缩比，不改运行时行为。
3. **排除 `**/*.map`** — 避免 source map 进包。

不做代码签名。不拆 Chromium、不换运行时。

## 建议但本迭代未做（风险更高）

- 只打 Noto woff2、去掉 500 字重：约 2–5 MB，中等字重中文会回退。
- 依赖系统 CJK 字体、不再内嵌 Noto：约 8 MB，Windows 无「微软雅黑」时中文会糊或缺字。
- 去掉可选 `node-pty`：本机 Shell 不可用。
- 换更轻的 MCP SDK 打包方式：收益小、回归面大。
- 分平台「精简 Electron」或换 Tauri：等于换架构。

结论：当前 170–200 MB 量级对带 Chromium 的桌面 SSH 客户端正常。优先靠语言包裁剪和压缩；字体与原生模块再动需要单独视觉 / 功能验收。
