# D22c 未开分块时捕获失败输出（2026-10-20，第 15 轮）

## 需求
分块默认关闭时，D22b 的"问 AI"也能带上失败命令的输出。只在内存，不落盘，遵守敏感命令规则。

## 设计（shared/failed-output.ts captureStart/Chunk/Exit，lib/failed-output.ts 接线）
- COMMAND_SUBMITTED_EVENT 开始捕获（每会话一条待定命令）；aiss-term-chunk 追加去 ANSI 文本，只留尾部 8000 字符；SHELL_EXIT_EVENT 结束。
- 退出码非 0：去掉回显行，取尾部 4000 字符，经 redactAuditText 打码（password=、token、Bearer、AKIA、私钥块等）后写入 D22b 的内存表；退出码 0 清除旧记录。
- isSensitiveCommand 命中的命令（与历史记录同一规则）不捕获、不入表，分块路径同样过滤。
- 不写 localStorage / 磁盘；关闭应用即消失。

## 限制
退出码依赖 Shell Integration（D14）；未注入时仍回退为命令 + 退出码。只捕获经命令栏/AI 提交的命令，终端里直接敲的命令不在内。
