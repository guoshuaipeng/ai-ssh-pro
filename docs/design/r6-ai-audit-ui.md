# Round 6 UX — AI 执行审计可见（2.1 可用切片）

## 现状
- 数据/写入/导出/检索已有 tab#、chosen>effective、source、cappedBy、protection。
- 审计表只显示 时间/类型/主机/结果/详情；策略仅塞在详情 title 里，来源与标签不可见；类型筛选缺 command/gate/ai.action。

## 目标（本轮切片）
一眼看到：跑了什么（详情）、风险保护、允/拦/消、主机、标签 #n、策略链；可按来源筛 AI。

## 交互
1. 筛选行加「来源」：全部 / AI / user / terminal…（不过度拆分）。
2. 类型选项补 command、gate、ai.action。
3. 表列：时间 | 类型 | 主机 | 来源 | 标签 | 结果 | 策略 | 详情。
4. 结果中文：已允许 / 已拦截 / 已取消（gate 优先 gateResult）。
5. 策略格：`#n · chosen→effective · 来源短名 · 保护`；无则 —。
6. 窄栏：策略/详情允许换行；来源/标签 flex:none，不挤扁。

## 验收
- 三档策略样例行在页上可见完整字段；只读拦截显示「已拦截」。
- 来源=AI 过滤只留 AI；搜索仍可用 #3 / capped:readonly。
- 宽/窄×深/浅截图；Core-A 34/34 + 新测。

## 不做（留给后轮）
对话内跳转审计（2.3）、大规模信息架构改版。
