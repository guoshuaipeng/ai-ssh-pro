# UI primitives

Prefer `src/renderer/src/components/ui/` for chrome:

- `Button` — primary / secondary / ghost / danger / icon (token-backed)
- `PanelHeader` — workspace / ops panel title + actions row
- `EmptyState` — shared empty surfaces (re-exported; do not fork)

Keep styles on design tokens only. Migrate call sites gradually; do not rewrite the whole app in one change.