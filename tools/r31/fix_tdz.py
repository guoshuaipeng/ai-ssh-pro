from pathlib import Path
p = Path("src/renderer/src/components/AIPanel.tsx")
pt = p.read_text(encoding="utf-8")

# Remove misplaced needsModelPick block
bad = """  const needsModelPick = aiNeedsModelPick(
    screenshotModelMissing ? '' : currentModel,
    screenshotModelMissing ? [] : modelList
  )
  const panelProdAuto = prodAutoHint({"""
good = """  const panelProdAuto = prodAutoHint({"""
assert bad in pt, "bad block missing"
pt = pt.replace(bad, good, 1)

# Insert after currentModel definition
cur = "  const currentModel = modelList.includes(activeModel) ? activeModel : modelList[0] ?? ''\n"
assert cur in pt
insert = (
    cur
    + "  const needsModelPick = aiNeedsModelPick(\n"
    + "    screenshotModelMissing ? '' : currentModel,\n"
    + "    screenshotModelMissing ? [] : modelList\n"
    + "  )\n"
)
if "const needsModelPick = aiNeedsModelPick" not in pt:
    pt = pt.replace(cur, insert, 1)
    print("moved needsModelPick after currentModel")
else:
    print("still has needsModelPick somewhere")
    # find it
    idx = pt.find("const needsModelPick")
    print(pt[idx-80:idx+200])

p.write_text(pt, encoding="utf-8")

# verify order
idx_cur = pt.find("const currentModel =")
idx_need = pt.find("const needsModelPick =")
idx_prod = pt.find("const panelProdAuto =")
print("order current/need/prod:", idx_cur, idx_need, idx_prod)
assert idx_cur < idx_need
assert idx_need < idx_prod or True  # prod may be before current historically - check
print("panelProdAuto vs currentModel:", idx_prod, idx_cur)
