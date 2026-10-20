# D87 侧栏拖放主机到分组

- 需求：整理主机时，只能右键 →「移动到」→ 选择分组，需要三步。
- 去重：grep docs/iterations 与 src（onDrop / dataTransfer），只有标签页拖动排序（App 中 tab 的 onDrop），侧栏没有拖放。
- 方案：
  - shared/host-drag.ts 提供 HOST_DRAG_MIME、dragIds（多选时拖动整个选区）、encode/decodeHostDrag、dropPlan（跳过已在目标分组的主机）。
  - SessionDockerBranch 主机行可拖动（onDragHost）。
  - 分组行（session-folder-row）接受拖放：悬停时显示虚线高亮，放下后调用与右键「移动到」相同的 moveProfileToFolder。
  - 主机都已在目标分组时，提示「已在「X」中」。
- 限制：拖回「未分组」仍用右键菜单；不支持分组之间排序。移动不删除任何数据，所以不需要确认。
