const fs = require('fs');

// Clear pending AI op on reset
let app = fs.readFileSync('src/renderer/src/App.tsx', 'utf8');
const re = /if \(detail\.op === 'reset'\) \{\r?\n        \/\/ c51: screenshot isolation[^\n]*\r?\n        closeContextMenu\(\)/;
if (!app.includes("__aissShotAiOp = undefined") && re.test(app)) {
  app = app.replace(
    re,
    (m) => m.replace(
      'closeContextMenu()',
      `;(window as unknown as { __aissShotAiOp?: unknown; __aissShotPop?: string }).__aissShotAiOp = undefined\n        ;(window as unknown as { __aissShotPop?: string }).__aissShotPop = undefined\n        closeContextMenu()`
    )
  );
  fs.writeFileSync('src/renderer/src/App.tsx', app, 'utf8');
  console.log('App reset clears pending AI op');
} else if (app.includes('__aissShotAiOp = undefined')) {
  console.log('already clears');
} else {
  console.error('reset block not matched');
}

// Clear pending after successful R14 apply in AIPanel — add after setLines in aiCancelled etc.
// Simpler: clear at start of successful handling for those ops after stash
let panel = fs.readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8');
if (!panel.includes('__aissShotAiOp = undefined')) {
  // After stashing block, when we actually handle, clear on apply for aiCancelled return paths.
  // Patch: right after stash assignment block, we don't clear. Clear when applying each op.
  panel = panel.replace(
    `;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
      }`,
    `;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
      }
      const clearShotAiOp = () => {
        ;(window as unknown as { __aissShotAiOp?: unknown }).__aissShotAiOp = undefined
      }`
  );
  // Add clearShotAiOp() before return of each R14 handler - after setLines
  for (const op of ['aiStreaming', 'aiCancelled', 'aiEmptyResume', 'aiProdBanner', 'aiSuggestCard', 'aiError', 'aiAccentStack']) {
    // Find "if (detail?.op === 'OP')" blocks and ensure clear before return - do a simple approach:
  }
  // Replace pattern: inside aiStreaming after screenshotForceKeyRef = true, add clear
  panel = panel.replace(
    /if \(detail\?\.op === 'aiStreaming'\) \{\r?\n        \/\/ H04\/H05[^\r\n]*\r?\n        screenshotForceKeyRef\.current = true/,
    (m) => m + '\n        clearShotAiOp()'
  );
  for (const op of ['aiCancelled', 'aiEmptyResume', 'aiProdBanner', 'aiSuggestCard', 'aiError', 'aiAccentStack']) {
    const re2 = new RegExp(`if \\(detail\\?\\.op === '${op}'\\) \\{\\r?\\n        screenshotForceKeyRef\\.current = true`);
    if (!re2.test(panel)) {
      console.error('missing op block', op);
    } else {
      panel = panel.replace(re2, (m) => m + '\n        clearShotAiOp()');
    }
  }
  fs.writeFileSync('src/renderer/src/components/AIPanel.tsx', panel, 'utf8');
  console.log('clearShotAiOp wired', panel.includes('clearShotAiOp()'));
} else {
  console.log('panel already clears');
}
