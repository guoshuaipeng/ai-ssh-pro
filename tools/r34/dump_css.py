from pathlib import Path
css = Path('src/renderer/src/styles.css').read_text(encoding='utf-8')
# dump safety chip + memory hierarchy blocks
markers = [
  'R19 Round19: policy menu touch',
  'R26',
  'R32',
  'ai-safety-chip',
  'ai-memory-chip',
  'has-failure-pin',
  'failure-evidence',
]
for m in markers:
    i = css.find(m)
    print(f'=== {m!r} @ {i}')
# print CSS around safety chip (7018 area from earlier)
for start,end in [(6980,7150),(7260,7320),(6400,6620),(6535,6570)]:
    print(f'\n----- {start}:{end} -----')
    print('\n'.join(f'{i+1}:{l}' for i,l in enumerate(css.splitlines()[start-1:end], start-1)))