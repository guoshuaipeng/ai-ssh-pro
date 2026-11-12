const fs = require('fs');
const p = 'tests/fixtures/held-out/h01-prod-policy.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.wiring.panelMustInclude = [
  'data-testid="ai-prod-auto-banner"',
  "protectionForUi === 'production'",
  'elevated && protectionForUi ==='
];
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('updated', j.wiring.panelMustInclude);
