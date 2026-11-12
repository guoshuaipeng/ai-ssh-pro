const fs = require('fs');
let app = fs.readFileSync('src/renderer/src/App.tsx', 'utf8');

// In the R14 ops open-panel block, stash detail for AIPanel replay
const re = /if \(\r?\n        detail\.op === 'aiChat' \|\|\r?\n        detail\.op === 'aiStreaming' \|\|[\s\S]*?detail\.op === 'aiAccentStack'\r?\n      \) \{\r?\n        setQuickOpen\(false\)\r?\n        setTourOpen\(false\)\r?\n        ensureAiVisible\(\)\r?\n        openRightPanelRef\.current\('ai'\)\r?\n        \/\/ AIPanel listens[^\r\n]*\r?\n        return\r?\n      \}/;

if (!re.test(app)) {
  const i = app.indexOf("detail.op === 'aiCancelled'");
  console.log('context', JSON.stringify(app.slice(i - 120, i + 400)));
  throw new Error('R14 open block not found');
}

app = app.replace(re, (m) => {
  if (m.includes('__aissShotAiOp = detail')) return m;
  return m.replace(
    "openRightPanelRef.current('ai')",
    `openRightPanelRef.current('ai')
        if (detail.op !== 'aiChat') {
          ;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
        }`
  );
});
fs.writeFileSync('src/renderer/src/App.tsx', app, 'utf8');
console.log('App stashes R14 ops', app.includes("__aissShotAiOp?: typeof detail"));

// Also increase AIPanel replay delay slightly so mount finishes
let panel = fs.readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8');
panel = panel.replace(
  'window.setTimeout(() => {\n          window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: pendingAi }))\n        }, 0)',
  "window.setTimeout(() => {\n          window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: pendingAi }))\n        }, 50)"
);
panel = panel.replace(
  'window.setTimeout(() => {\r\n          window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: pendingAi }))\r\n        }, 0)',
  "window.setTimeout(() => {\r\n          window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: pendingAi }))\r\n        }, 50)"
);
fs.writeFileSync('src/renderer/src/components/AIPanel.tsx', panel, 'utf8');
console.log('replay delay', panel.includes(', 50)'));
