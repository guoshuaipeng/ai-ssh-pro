# -*- coding: utf-8 -*-
from pathlib import Path
from datetime import datetime

retro = Path('docs/retro.md')
backlog = Path('docs/backlog.md')
r = retro.read_text(encoding='utf-8').replace('\r\n', '\n')
b = backlog.read_text(encoding='utf-8').replace('\r\n', '\n')

retro_block = '''
## Round 23 — 2026-11-05（失败故事去重 + 带证据重试后滚到确认）
- 计划：约 30 分钟；1 高频：失败钉 vs ExecReplay「失败 · exit」双报 → 一条冷静失败故事；1 小打磨：带证据重试后自动滚到新确认卡。
- 实际：~25 分钟；两项各一提交；Core-A 34/34 + held-out 全绿。
- 卡住点：① 直接 `tsx --test` 引 i18n 缺 `@shared/workspace-features` → 仍须 `--tsconfig tsconfig.web.json`（R20 起规则）；② PowerShell 多行改 AIPanel 继续用 `tools/r23/*.py`。
- 根因：失败钉与 ExecReplay 各自讲「失败」；重试只 submit、依赖 `block:nearest` 不够，尾部 scroll 抢走焦点。
- 预防：钉卡出现时状态行禁喊失败/exit；确认出现路径（重试/深链）共用 `focusAiPendingAfterFailure` + 延迟二次 scroll。
- 验收：`test-r23-failure-status-dedupe` / `test-r23-retry-scroll-confirm` + Core-A 34/34 + held-out 全绿。
- 提交：`afbea4ec`（去重）、`73ae9801`（重试滚动）；docs 同轮。
- 逢 3 轮整页视觉：上一整页在 Round 21 → **下一目标 Round 24**（本轮非整页）。

'''

if '## Round 23 —' not in r:
    # insert after title / near top after Round 22 if present
    if '## Round 22 —' in r:
        r = r.replace('## Round 22 —', retro_block + '## Round 22 —', 1)
    else:
        r = r.rstrip() + '\n' + retro_block
    retro.write_text(r, encoding='utf-8', newline='\n')
    print('retro appended')
else:
    print('retro already')

backlog_block = '''
## 2026-11-05 Round 23 追加
- 已完成：失败钉存在时 ExecReplay 状态安静为「执行输出」（不再「失败 · 退出码」双报；行内审计 CTA 隐藏，钉卡持有审计）；「带证据重试」后新确认卡/坞自动居中滚动并短暂高亮（与「下一步待确认」共用 helper）。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R22；本轮未扩拍）。
- P3：极窄栏失败钉 + 安静状态行叠在一起时可读性再抽检（Round 24 整页视觉一并看）。
- P1 候选 Round 24：保持 AI 对话——**逢 3 轮整页视觉审计**（R21 后下一拍）/ 或失败重试后确认卡与计划步号芯片再对齐 / 或 Roadmap 迭代 3 前扫对话缺口；默认不接端口转发。

### Round 23 UX 验收（编码后）
- 一条失败故事：钉卡标题/kind/证据/主 CTA；下方仅「执行输出」+ 耗时/行数，无第二句「失败」。
- 带证据重试 → 新确认出现后坞/卡进入视口并 `data-after-evidence-retry`；预算用尽仍只填输入框。
- 守卫：`test-r23-failure-status-dedupe` / `test-r23-retry-scroll-confirm`；Core-A 34/34；held-out H01–H08 绿。

'''

if '## 2026-11-05 Round 23 追加' not in b:
    # prepend near top after any intro header
    if '## 2026-11-05 Round 22' in b or '### Round 22 收口' in b:
        # insert before Round 22 section if we can find Round 22 收口
        marker = '### Round 22 收口（AI 对话）'
        if marker in b:
            b = b.replace(marker, backlog_block + marker, 1)
        else:
            b = backlog_block + b
    else:
        b = backlog_block + b
    backlog.write_text(b, encoding='utf-8', newline='\n')
    print('backlog appended')
else:
    print('backlog already')
