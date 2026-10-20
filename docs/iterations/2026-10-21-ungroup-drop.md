# D90 拖回「未分组」

- 需求：D87 只支持把主机拖进分组；要移出分组仍需右键 → 移动到 → 未分组。
- 去重：grep 只找到 D87 的分组行拖放，没有拖回未分组的入口。
- 方案：
  - 开始拖动主机时（hostDragging），在侧栏未分组主机上方临时显示一个虚线区域「拖到这里移出分组」（ungroup-drop）。
  - 放下后用 ungroupPlan 只处理当前在分组里的主机，再调用 moveProfileToFolder(ids, undefined)，与右键菜单相同。
  - dragend 或 drop 后隐藏这个区域；没有分组时不显示。
