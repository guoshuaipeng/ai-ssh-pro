/** L8: when a folder-sync preview should pin into a center tab, and the guided path. */

export const PREVIEW_PIN_THRESHOLD = 50

export const FILE_WORKFLOW = ['sftp', 'diff', 'edit', 'preview', 'resume'] as const

export type FileWorkflowStep = (typeof FILE_WORKFLOW)[number]

export function shouldPinSyncPreview(changeCount: number, explicit: boolean): boolean {
  return explicit || changeCount > PREVIEW_PIN_THRESHOLD
}

export function changeCount(rows: Array<{ kind: string }>): number {
  return rows.filter((r) => r.kind === 'new' || r.kind === 'changed' || r.kind === 'deleted').length
}
