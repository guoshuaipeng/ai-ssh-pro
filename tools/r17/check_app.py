from pathlib import Path
t = Path('src/renderer/src/App.tsx').read_text(encoding='utf-8')
print('sessionStateRef', 'sessionStateRef' in t)
print('Round 17 listener', 'Round 17: jump from audit' in t)
print('focusExecToken prop', 'focusExecToken={aiFocusExecToken}' in t)
# Check order: convTabs defined before listener?
idx_conv = t.find('const convTabs = useMemo')
idx_listen = t.find('Round 17: jump from audit')
idx_open_audit = t.find('// 2.3: jump from ExecReplay')
print('convTabs', idx_conv, 'openAudit effect', idx_open_audit, 'r17', idx_listen)
print('order ok', idx_conv < idx_listen)
# Does updateLayout exist before?
idx_ul = t.find('const updateLayout')
print('updateLayout', idx_ul, 'before r17', idx_ul < idx_listen)
