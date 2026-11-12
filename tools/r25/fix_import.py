from pathlib import Path
p = Path("src/renderer/src/components/AIPanel.tsx")
t = p.read_text(encoding="utf-8")
old = """import {
  alignPlanStepDisplay,
  buildSuggestionStepNos,
  collectSuggestionCommands,
  findConfirmableLineIndex,
  formatSuggestionCommandsForCopy
} from '@shared/ai-suggestion-steps'
"""
new = """import {
  alignPlanStepDisplay,
  buildSuggestionStepNos,
  collectSuggestionCommands,
  findConfirmableLineIndex,
  formatSuggestionCommandsForCopy,
  planStepDisplayMax
} from '@shared/ai-suggestion-steps'
"""
if "planStepDisplayMax" in t[t.find("alignPlanStepDisplay") : t.find("from '@shared/ai-suggestion-steps'")]:
    print("already imported")
elif old not in t:
    raise SystemExit("import block missing")
else:
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("import fixed")
