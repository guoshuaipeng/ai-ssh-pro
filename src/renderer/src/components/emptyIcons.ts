import type { IconName } from '@shared/icon-registry'

/** Linear stroke for empty-state glyphs and the shared app mark. */
export const EMPTY_ICON_STROKE = 1.5

/** Titlebar / sidebar chrome glyph size (hit target stays 32px). */
export const CHROME_ICON_SIZE = 16
/** Same visual weight as empty-state stroke. */
export const CHROME_ICON_STROKE = EMPTY_ICON_STROKE

/** Default icon slot. Compact slot is 32. CSS maps these to --space-7 / --space-6. */
export const EMPTY_ICON_SIZE = 48
export const EMPTY_ICON_SIZE_COMPACT = 32

/** One illustration per empty surface. Callers pass the key; the kit draws it. */
export const EMPTY_ICONS = {
  host: 'monitor',
  sftp: 'folder',
  snippet: 'clipboard-list',
  forward: 'arrow-left-right',
  alert: 'bell',
  audit: 'scroll-text',
  docker: 'list-tree'
} as const satisfies Record<string, IconName>

export type EmptyIconKey = keyof typeof EMPTY_ICONS

/**
 * One face for the welcome card and the about page.
 * Screen, title rule, prompt, cursor, and stand — a single path.
 */
export const APP_MARK_PATH =
  'M10 9H38A3 3 0 0 1 41 12V30A3 3 0 0 1 38 33H10A3 3 0 0 1 7 30V12A3 3 0 0 1 10 9ZM7 16h34M14 23l5 4-5 4M23 31h10M18 39h12'
