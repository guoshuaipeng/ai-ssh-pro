# 安装包体积排查：v0.6.63（路线图 1.5）

日期：2026-10-20　范围：Windows NSIS 安装包（x64）　方法：静态分析（未重新打包）

## 一、结论

Windows 安装包由 v0.6.36 的 85.7 MB 增至 v0.6.63 的 168.6 MB（+82.9 MB）。增量几乎全部来自 v0.6.37（提交 `3bfbef9`）把三个 `@fontsource/*` 字体包加入 `dependencies`：electron-builder 会把 `dependencies` 下的全部 node_modules 原样打进 `app.asar`，其中 `@fontsource/noto-sans-sc` 单包 71.2 MB（包含全部字重、全部 unicode 子集的 woff 与 woff2）。而渲染进程实际用到的字体已经由 Vite 打包进 `out/renderer/assets`（8.6 MB），asar 中的字体包是**完全冗余**的副本。

把三个字体包移到 `devDependencies` 即可让安装包回到约 **95 MB**，满足路线图「≤ 110 MB」的验收标准。

## 二、证据

| 项目 | 数据 | 来源 |
|---|---|---|
| v0.6.36 安装包 | 85.7 MB | `release/AI-SSH-Pro-0.6.36-win-x64.exe` |
| v0.6.63 安装包 | 168.6 MB | `release/AI-SSH-Pro-0.6.63-win-x64.exe` |
| electron-builder 配置差异 | 无（`build` 段 v0.6.36 → HEAD 未变；`files: ["out/**/*"]`，无 asarUnpack / extraResources 变化） | `git diff v0.6.36 HEAD -- package.json` |
| 依赖差异 | 仅新增 `@fontsource/inter`、`@fontsource/jetbrains-mono`、`@fontsource/noto-sans-sc`（均在 `dependencies`） | 同上；`git log -S` 定位到 `3bfbef9`（v0.6.37） |
| `app.asar`（v0.6.63 win-unpacked） | 114.9 MB；`app.asar.unpacked` 9.9 MB（node-pty、ssh2 原生模块） | `release/win-unpacked/resources` |
| 字体在构建产物中的实际占用 | 66 个文件，8.6 MB（已在 `out/renderer/assets`） | `out/` 统计 |

`app.asar` 内容构成（读取 asar 头部统计，未解包）：

| 条目 | 大小 |
|---|---|
| node_modules/@fontsource/noto-sans-sc | 71.2 MB |
| out（应用本体，含已打包的字体） | 12.5 MB |
| node_modules/react-dom | 4.3 MB |
| node_modules/@fontsource/inter | 4.1 MB |
| node_modules/@modelcontextprotocol/sdk | 3.7 MB |
| node_modules/zod | 3.2 MB |
| node_modules/@xterm/xterm | 2.2 MB |
| node_modules/@fontsource/jetbrains-mono | 1.7 MB |
| 其余 | 约 10 MB |
| 合计（不含 unpacked） | 112.9 MB |

字体文件（woff/woff2）本身已压缩，NSIS 无法再压缩，因此 77 MB 字体包几乎按原大小计入安装包，与 +82.9 MB 的增量吻合。

## 三、瘦身项

| # | 措施 | 预计节省（安装包） | 风险 |
|---|---|---|---|
| 1 | 将 `@fontsource/inter`、`@fontsource/jetbrains-mono`、`@fontsource/noto-sans-sc` 从 `dependencies` 移到 `devDependencies`。渲染进程由 Vite 打包，运行时不再引用 node_modules 中的字体。 | 约 70–74 MB | 低。需确认主进程无字体引用（`src/main` 中无 `@fontsource` 导入，已核实），打包后冒烟检查中英文字体渲染 |
| 2 | 同理将仅渲染进程使用、已被 Vite 打包的依赖（react、react-dom、react-markdown、remark-gfm、@xterm/*）移到 `devDependencies`；主进程用 `externalizeDepsPlugin`，只需保留主进程 / preload 实际 `import` 的包（ssh2、electron-store、@modelcontextprotocol/sdk、zod、uuid、zmodem.js 等，需逐个核对） | 约 3–5 MB | 中。误移主进程依赖会导致启动失败，必须逐包核对 `out/main` 的外部导入并做打包冒烟 |
| 3 | 字体只引入 woff2（自定义 `@font-face` 或仅引用 woff2 子集），去掉 woff 回退；Electron 的 Chromium 均支持 woff2 | 约 4 MB | 低 |
| 4 | Noto Sans SC 只保留 400 / 600 两个字重（500 用 600 或系统字体替代） | 约 2.5 MB | 低到中，视觉需设计确认 |
| 5 | electron-builder 设置 `electronLanguages: ["zh-CN","en-US"]` 删除其余 Chromium 语言包 | 约 5–7 MB（未压缩约 40 MB 的 locales 中大部分） | 低 |

## 四、预估

- 仅执行第 1 项：约 **95 MB**（168.6 − ~73），已满足 ≤ 110 MB。
- 执行第 1、3、5 项：约 **85–88 MB**，回到 v0.6.36 水平。
- 全部执行：约 **80–85 MB**。

以上为根据 asar 内容与字体不可压缩特性推算，需以实际打包结果为准。macOS / Linux 包（181–195 MB）原因相同，第 1 项同样适用。

## 五、建议

第 1 项改动小、收益最大，建议在下一个版本直接实施并在发布前对比安装包大小；第 5 项随后加入；第 2 项单独开分支，逐包核对后再合入。
