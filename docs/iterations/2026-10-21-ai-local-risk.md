# D48 AI 建议命令的本地高风险提示（2026-10-21 第 23 轮）

## 核对
- D16d 的逐条执行进度条已有红色高风险状态（ai-script-run 用 assessCommandRisk 判断 risky）。
- ai-run 的 S2 主机保护流程也会做本地风险判断。
- 缺口：AI 回复卡片（结构化卡片和普通卡片）上的「同意执行」按钮。安全分级没开时，planCommandConfirm 不参与，按钮会直接执行。这时 rm -rf、mkfs 这类本地就能判定的高风险命令，既没有提示也不需要确认。

## 方案
- SafetyCommandBar 对每条命令跑一次 assessCommandRisk，命中时在按钮旁显示红色的「高风险：原因」。
- 点「同意执行」前弹一次危险确认，复用 confirm.dangerCommand；已经是 strong 模式的不重复弹。
- 不拦截，确认后照常执行。生产主机不额外限制，和项目规则一致。
