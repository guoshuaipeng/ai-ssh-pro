# -*- coding: utf-8 -*-
"""R30 item1: every-3 full-page visual audit + banner narrow/touch quick P2."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

design = ROOT / "docs/design/r30-full-page-visual-audit.md"
design.write_text("""# Round 30 design — full-page visual audit (AI dialog) + process milestone

## UX review (before code)
- **Cadence**: every 3 rounds (last full-page: Round 27). Scope = AI panel chrome (banners, memory/failure, empty·error, narrow), not whole app.
- **Pass**: code review of hierarchy / empty·error / failure-pin+memory / readonly↔prod banners + harness wide/narrow × dark/light where matrix already exists (R14–R29).
- **Main CTA**: failure pin still 「带证据重试」; Agree still only confirm primary; banners are reminder strips (open policy), not primary action.
- **Binding**: banners bind session `protection` / screenshot override; readonly and prod-auto are mutually exclusive in JSX (`panelReadonly && !panelProdAuto`).
- **Empty/error**: config empty (`ai-empty-state`) ≠ model-missing ≠ reply-empty ≠ error card; cancelled/stream accents stay distinct (R14).

## Findings (pre-fix, from matrix + code R14–R29)

| Pri | Finding | Disposition |
|-----|---------|-------------|
| P2 | Host banners lack touch `min-height: 32px` (padding 6+fs-xs ≈28) vs list-row 32 / R27 memory rule | **R30 quick fix**: banner `min-height: 32px` |
| P2 | ≤230px: long ZH chip + hint compete; prod matrix (R14) has **no narrow** shot; readonly (R29) has narrow but no side-by-side contrast folder | **R30**: `@container` hide hint + ellipsis chip; contrast matrix `docs/screenshots/r30/` |
| P2 | True-device Tauri wide/narrow × dark/light still oral debt (R6+) | Keep Electron declarative matrix; no Tauri this round |
| P3 | Pending Decline weight / policy pop title wrap / EN chip short labels (R19) | Accept; backlog |
| P3 | model-missing + banner can stack (ok tone vs warn) — readable, no merge | Accept; watch in contrast shots |
| ok | Dual banner mutual exclusivity | R29 JSX |
| ok | Failure pin demotes memory; filter-empty ≠ true-empty | R26–R28 |
| ok | Memory touch ≥32px | R27 |

## Item 1 — audit backlog + banner narrow/touch (quick P2)
- Append Round 30 full-page table to `docs/backlog.md`.
- CSS after R29 banner block: min-height 32px; `@container (max-width: 230px)` hide hints; chip ellipsis (no token fallbacks).

## Item 2 — prod↔readonly contrast matrix `docs/screenshots/r30/`
- Shots: contrast-prod / contrast-prod-narrow / contrast-readonly / contrast-readonly-narrow × dark/light.
- Expect: exactly one banner family; Chinese chip text; mutual exclusion.

## Must-verify
1. Core-A 34/34; held-out H01–H08 green.
2. `test-r30-*` green; r30 shots expect true after rebuild.
3. Designer: banners ≥32px; narrow chip readable without crushed hint; prod warn ≠ readonly ok tone.

## After code
- (filled by docs commit)
- Next full-page visual: **Round 33**. Round 31 suggestion: AI-dialog — empty/error narrow matrix or Roadmap iter-3 gap (port-forward still deferred).
""", encoding="utf-8")
print("design ok")

# --- CSS quick fix ---
css = ROOT / "src/renderer/src/styles.css"
c = css.read_text(encoding="utf-8")
marker = "/* R30 Round30: host banner touch + narrow (visual audit P2) */"
if marker not in c:
    block = """
/* R30 Round30: host banner touch + narrow (visual audit P2) */
.ai-prod-auto-banner,
.ai-readonly-banner {
  min-height: 32px;
  box-sizing: border-box;
}
.ai-prod-auto-text,
.ai-readonly-text {
  min-width: 0;
}
@container (max-width: 230px) {
  .ai-prod-auto-hint,
  .ai-readonly-hint {
    display: none;
  }
  .ai-prod-auto-text,
  .ai-readonly-text {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

"""
    # Insert after readonly hint block (end of R29 banner CSS)
    anchor = ".ai-readonly-hint {\n  color: var(--color-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}"
    if anchor not in c:
        # softer anchor
        soft = "/* H08: key ok but no model"
        if soft not in c:
            raise SystemExit("CSS anchor missing for R30 banner")
        c = c.replace(soft, block + soft, 1)
    else:
        c = c.replace(anchor, anchor + "\n" + block, 1)
    start = c.index(marker)
    end = start + 500
    chunk = c[start:end]
    if re.search(r"var\(--[^,)]+,\s*[^)]+\)", chunk):
        raise SystemExit("token fallback in R30 CSS")
    css.write_text(c, encoding="utf-8")
    print("css ok")
else:
    print("css already")

# --- wiring test ---
test = ROOT / "scripts/test-r30-visual-audit-banner.ts"
test.write_text("""/** R30: full-page visual audit quick P2 — host banner touch ≥32px + narrow hide hint. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')
const css = norm('src/renderer/src/styles.css')

assert.ok(css.includes('R30 Round30: host banner touch + narrow'))
const start = css.indexOf('R30 Round30: host banner touch + narrow')
const block = css.slice(start, start + 700)
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(block), false, 'no token fallbacks in R30 CSS')
assert.ok(/\\.ai-prod-auto-banner,\\s*\\.ai-readonly-banner\\s*\\{[\\s\\S]*?min-height:\\s*32px/.test(block))
assert.ok(block.includes('@container (max-width: 230px)'))
assert.ok(/\\.ai-prod-auto-hint,\\s*\\.ai-readonly-hint\\s*\\{[\\s\\S]*?display:\\s*none/.test(block))
assert.ok(/text-overflow:\\s*ellipsis/.test(block))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('panelReadonly && !panelProdAuto'), 'readonly/prod mutually exclusive')
assert.ok(panel.includes('data-testid="ai-prod-auto-banner"'))
assert.ok(panel.includes('data-testid="ai-readonly-banner"'))

const design = norm('docs/design/r30-full-page-visual-audit.md')
assert.ok(design.includes('full-page visual audit'))
assert.ok(design.includes('min-height: 32px') || design.includes('banner `min-height: 32px`'))
assert.ok(design.includes('contrast'))

const backlog = norm('docs/backlog.md')
assert.ok(
  backlog.includes('Round 30 全页') ||
    backlog.includes('Round 30 整页') ||
    backlog.includes('2026-11-05 Round 30')
)

console.log('test-r30-visual-audit-banner: ok')
""", encoding="utf-8")
print("test1 ok")

# --- backlog prepend ---
bl = ROOT / "docs/backlog.md"
bt = bl.read_text(encoding="utf-8")
section = """## Round 30 全页轻量视觉审计（逢 3 轮，R27 后下一拍；R14–R29 矩阵 + 代码审查）→ backlog
依据：`docs/screenshots/r14|r27|r28|r29` README 矩阵与当前 AI 面板双横幅 / 记忆·失败钉 / 空错态结构（Electron harness；未新开 Tauri 真机全量）。

| 级别 | 问题 | 处置 |
|------|------|------|
| ~~P2~~ | ~~主机横幅触控高度 ≈28px（对照 `--list-row-height: 32px` / R27 记忆）~~ | ✅ Round 30 `min-height: 32px` |
| ~~P2~~ | ~~≤230px 长中文 chip+hint 互挤；R14 prod 无窄栏对照~~ | ✅ Round 30 `@container` 藏 hint + ellipsis；`docs/screenshots/r30/` 对照矩阵 |
| P2 | 真机 Tauri 宽/窄×深/浅全量矩阵仍口头债（R6 起） | 继续 declarative matrix；勿再口头延期 |
| P3 | pending Decline 权重 / 策略 pop 标题窄栏两行 / EN chip（R19） | 可接受 |
| P3 | model-missing 与横幅可同屏叠放 | 可接受；对照矩阵抽检 |
| ok | 只读/生产横幅互斥；失败钉降权记忆；filter-empty ≠ true-empty | R26–R29 已做 |

## 2026-11-05 Round 30 追加
- **已完成**：逢 3 轮整页视觉审计（设计 `docs/design/r30-full-page-visual-audit.md`）+ 横幅触控/窄栏快修。
- **已完成**：生产↔只读横幅对照截图矩阵 `docs/screenshots/r30/`。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R30）。
- P3：英文 chip Confirm/Suggest/Auto；策略题继续 held-out。
- P1 候选 Round 31：保持 AI 对话——空/错态窄栏进矩阵 / 或 Roadmap 迭代 3 前对话缺口（端口转发仍默认不接）。
- 下一整页视觉目标：**Round 33**。

### Round 30 UX 验收（编码后）
- 主 CTA：横幅仍是提醒条（开策略）；待确认仍 Agree；失败钉「带证据重试」。
- 绑定：横幅绑本会话 protection / screenshot override；只读与生产互斥。
- 空/错：横幅 ≠ model-missing / reconnect / config empty。
- 守卫：`test-r30-visual-audit-banner` / `test-r30-contrast-shots`；Core-A 34/34；held-out H01–H08 绿。

"""
if "Round 30 全页轻量视觉审计" not in bt:
    # Insert after title / near top after first heading block
    if bt.startswith("# Backlog"):
        # after first blank line following title
        parts = bt.split("\n", 2)
        # Prefer insert before Round 27 audit section if present
        marker27 = "## Round 27 全页轻量视觉审计"
        if marker27 in bt:
            bt = bt.replace(marker27, section + marker27, 1)
        else:
            # prepend after first line
            nl = bt.find("\n")
            bt = bt[: nl + 1] + "\n" + section + bt[nl + 1 :]
    else:
        bt = section + bt
    bl.write_text(bt, encoding="utf-8")
    print("backlog ok")
else:
    print("backlog already")

print("item1 done")
