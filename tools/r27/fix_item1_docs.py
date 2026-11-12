# -*- coding: utf-8 -*-
"""Refresh R27 touch test + prepend Round 27 visual audit backlog table."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

(ROOT / "scripts/test-r27-visual-audit-touch.ts").write_text(
    """/** R27: full-page visual audit quick P2 — memory touch targets ≥32px; no token fallbacks. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')
const css = norm('src/renderer/src/styles.css')

assert.ok(css.includes('R27 Round27: memory expand touch hit'))
const r25 = css.indexOf('R25 Round25: working-memory expand UX')
assert.ok(r25 >= 0)
const head = css.indexOf('.ai-panel .ai-header-shortcut kbd {', r25)
assert.ok(head > r25)
const memoryChunk = css.slice(r25, head)
assert.equal(memoryChunk.includes('min-height: 28px'), false, 'R25 memory chunk must not keep 28px')
assert.ok(/\\.ai-memory-close\\s*\\{[\\s\\S]*?min-height:\\s*32px/.test(memoryChunk))
assert.ok(/ai-memory-jump-btn\\s*\\{[\\s\\S]*?min-height:\\s*32px/.test(memoryChunk))

const r27 = css.indexOf('R27 Round27: memory expand touch hit')
assert.ok(r27 > r25, 'R27 marker after R25')
const r27end = css.indexOf('.ai-panel .ai-header-shortcut kbd {', r27)
const r27block = css.slice(r27, r27end > r27 ? r27end : r27 + 400)
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(r27block), false, 'no token fallbacks in R27 CSS')
assert.ok(/\\.ai-memory-chip\\s*\\{[\\s\\S]*?min-height:\\s*32px/.test(r27block))

const design = norm('docs/design/r27-full-page-visual-audit.md')
assert.ok(design.includes('full-page visual audit'))
assert.ok(design.includes('seed matching') || design.includes('bump to 32px'))

const backlog = norm('docs/backlog.md')
assert.ok(backlog.includes('Round 27 全页轻量视觉审计') || backlog.includes('2026-11-05 Round 27'))

console.log('test-r27-visual-audit-touch: ok')
""",
    encoding="utf-8",
)
print("test refreshed")

backlog = ROOT / "docs/backlog.md"
b = backlog.read_text(encoding="utf-8")
section = """
## Round 27 全页轻量视觉审计（逢 3 轮，R24 后下一拍；R14–R26 矩阵 + 代码审查）→ backlog
依据：`docs/screenshots/r14|r17|r18|r20|r22|r25|r26` README 矩阵与当前 AI 面板 / 审计空态结构（Electron harness；未新开 Tauri 真机全量）。

| 级别 | 问题 | 处置 |
|------|------|------|
| ~~P2~~ | ~~R26 jump-audit 空审计库 → true-empty，不是命中态~~ | ✅ Round 27 polish：jump 前 seed 匹配 `appendAudit` 再重拍 |
| ~~P2~~ | ~~记忆 close / jump-btn `min-height: 28px` 触控偏紧（对照 `--list-row-height: 32px`）~~ | ✅ Round 27 `32px` |
| P2 | 真机 Tauri 宽/窄×深/浅全量矩阵仍口头债（R6 起） | 继续 declarative matrix；勿再口头延期 |
| P3 | pending Agree/Decline/审计在 280px Decline 权重（R19） | 可接受；若仍抢再降一档 |
| P3 | 策略 pop 标题「AI 执行策略（此标签页）」窄栏两行（R19） | 可接受 |
| P3 | 英文 chip Confirm/Suggest/Auto vs 菜单全称（R19） | 真机不混淆即可 |
| ok | 失败钉同屏记忆 muted；filter-empty ≠ true-empty | R26 已做 |
| ok | 失败「下一步 · n」+ 计划步对齐 | R22–R24 已做 |

## 2026-11-05 Round 27 追加
- 已完成：逢 3 轮整页视觉审计入 backlog；记忆展开触控命中 ≥32px。
- 已完成：jump-audit 种子匹配审计行后重拍 → `docs/screenshots/r27/`（见 polish 提交）。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R27）。
- P1 候选 Round 28：保持 AI 对话——Roadmap 迭代 3 前扫对话缺口 / 或策略 Decline 权重 / 或过滤-empty 故意态进矩阵；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。
- 下一整页视觉目标：**Round 30**。

"""
if "Round 27 全页轻量视觉审计" not in b:
    marker = "## 2026-11-05 Round 26 追加"
    if marker in b:
        b = b.replace(marker, section + marker, 1)
    else:
        b = section + b
    backlog.write_text(b, encoding="utf-8")
    print("backlog: R27 audit table")
else:
    print("backlog: already")
