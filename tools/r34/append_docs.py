# -*- coding: utf-8 -*-
from pathlib import Path
from datetime import datetime

retro = Path('docs/retro.md')
rt = retro.read_text(encoding='utf-8')
entry = '''
## Round 34 — 2026-11-05（ZH/EN 策略芯片对比 + 失败钉/记忆层级；**本轮收束，不再开 R35+**）
- 计划：约 30 分钟；1 高频：ZH/EN policy chip 对比矩阵 + 对比度 CSS；1 小打磨：失败钉+记忆同屏再收一档；编码前 UX。
- 实际：两项各一提交 + docs；Core-A 34/34 + held-out H01–H08 全绿；r34 截图 24/24（12 态 × 深/浅）。
- 卡住点：① item1 测试误用 `tsconfig.node` 引 i18n → 改 `tsconfig.web`；② 扩 failure-memory 后 item1 硬编码 length=10 断言红 → 放宽 ≥10。
- 根因：矩阵扩名后旧 deepEqual 未同步；i18n 仍须 web tsconfig（R20 起规则）。
- 预防：矩阵 `Rxx_AI_SHOT_NAMES` 断言用 includes/≥n，勿锁死全表；带 translate 的守卫默认 web。
- 验收：`test-r34-zh-en-policy-chip-contrast` / `test-r34-failure-memory-hierarchy` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r34/`。
- 提交：`8a8927d7`（芯片对比）、item2 本提交（失败/记忆）、docs 同轮。
- **停轮**：用户要求测完收尾，**不再开 Round 35+**；原计划 **Round 36 整页视觉取消**。
- 逢 3 轮整页视觉：上一拍 Round 33 → 原下一目标 Round 36 → **已取消**。

'''
if 'Round 34 — 2026-11-05' not in rt:
    # prepend after title-ish: insert at top after first heading if any
    if rt.startswith('#'):
        nl = rt.find('\n')
        rt = rt[:nl+1] + entry + rt[nl+1:]
    else:
        rt = entry + rt
    retro.write_text(rt, encoding='utf-8')
    print('retro appended')
else:
    print('retro already has R34')

bl = Path('docs/backlog.md')
bt = bl.read_text(encoding='utf-8')
block = '''
## 2026-11-05 Round 34 追加（收束停轮）
- **已完成**：ZH/EN 策略芯片对比矩阵 `docs/screenshots/r34/`（需确认/仅建议/自动 × Ask/Suggest/Auto + 窄栏 + pop）；`aiPolicy` 截图 op；band tint CSS；标签 max-width 给 Suggest/仅建议留空。
- **已完成**：失败钉同屏记忆再降权（opacity 0.58、宽栏也藏 label、wrap 收窄）；failure-memory 截图进同目录。
- **停轮声明**：用户要求测完收尾 → **停止持续迭代，不再开 Round 35 / 36**。原「下一整页视觉 Round 36」**取消**。
- P2 遗留（不自动开轮）：真机 Tauri 宽窄×深浅全量矩阵（R6 起 Electron harness 已覆盖 R14–R34）。
- P3 遗留：pending Decline 权重 / 策略 pop 标题窄栏两行 / EN Ask 口语同形 — 可接受。
- 未做（记债、不开轮）：端口转发默认不接；全仓 ui-n6 token fallback 债。

### Round 34 UX 验收（编码后）
- 主 CTA：待确认仍 Agree；失败钉仍「带证据重试」；chip 短标签 Ask ≠ Confirm。
- 绑定：`aiPolicy` 只写本标签 temp；locale 只改本窗；失败钉仍绑当前会话。
- 空/错：失败钉主叙事，记忆 count-only 降权。
- 守卫：`test-r34-*`；Core-A 34/34；held-out H01–H08 绿；截图 24/24。

'''
if 'Round 34 追加' not in bt:
    bt = block + bt
    bl.write_text(bt, encoding='utf-8')
    print('backlog prepended')
else:
    print('backlog already has R34')