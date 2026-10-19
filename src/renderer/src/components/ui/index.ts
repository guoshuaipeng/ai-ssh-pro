/**
 * Shared UI primitives for chrome consistency.
 * Prefer `ui/Button`, `ui/PanelHeader`, and `EmptyState` for new titlebar / panel / dialog controls.
 * Do not introduce one-off hex colors — tokens only (`--space-*`, `--radius-*`, `--fs-*`, theme colors).
 */
export { default as Button } from './Button'
export type { ButtonVariant } from './Button'
export { default as PanelHeader } from './PanelHeader'
export { default as EmptyState } from '../EmptyState'