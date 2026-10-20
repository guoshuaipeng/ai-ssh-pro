# D20b 本机终端重连恢复目录（2026-10-20，第 15 轮）

## 需求
本机 Shell 标签重连后回到断开前的目录（SSH 已由 D2 覆盖）。

## 现状
reconnectTab 的 local 分支直接 openLocalShell()，总是从用户主目录启动；Windows 的 cmd/PowerShell 提示符也没被识别为 cwd。

## 设计
- 识别：本机会话额外解析 `PS C:\x> ` / `C:\x>`（cwdFromWinPrompt）；OSC 7 与 bash 提示符照旧。
- 恢复：不往终端敲 cd（cmd/PowerShell/bash 语法不同），而是把目录交给主进程，作为 pty 的启动目录。主进程 localStartCwd 校验：绝对路径、`~/` 展开、必须是存在的目录，否则回到主目录。
- 成功时 meta.startCwd 回传，渲染端更新 cwd 并提示"已回到 …"。

## 限制
只在重连时生效；新开本机 Shell 仍从主目录开始。
