# -*- coding: utf-8 -*-
from pathlib import Path
m = Path("scripts/ai-shot-matrix-r33.mjs")
t = m.read_text(encoding="utf-8")
old = """    {
      name: 'r33-miss-toast',
      toasts: true,
      wait: 1600,
      steps: [...openZh, { op: 'aiMissToast' }],
      expect: expectMiss
    },"""
new = """    {
      name: 'r33-miss-toast',
      toasts: true,
      wait: 1600,
      steps: [...openZh, { op: 'aiMissToast' }, { eval: "JSON.stringify({cls:document.documentElement.className,toast:document.querySelector('[data-testid=toast]')?.textContent,action:document.querySelector('[data-testid=toast-action]')?.textContent,stackVis:getComputedStyle(document.querySelector('.toast-stack')||document.body).visibility,n:document.querySelectorAll('[data-testid=toast]').length})" }],
      expect: expectMiss
    },"""
if old not in t:
    raise SystemExit('block missing')
m.write_text(t.replace(old, new, 1), encoding="utf-8", newline="\n")
print("diag added")
