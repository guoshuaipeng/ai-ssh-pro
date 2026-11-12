from pathlib import Path
pt = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
print("needsModelPick count:", pt.count("needsModelPick"))
print("panelProdAuto && !needsModelPick:", "panelProdAuto && !needsModelPick" in pt)
print("readonly gate:", "panelReadonly && !panelProdAuto && !needsModelPick" in pt)
idx = pt.find("const currentModel")
print(pt[idx:idx+350])
idx = pt.find("{needsModelPick ?")
print("jsx:", pt[idx:idx+120])
