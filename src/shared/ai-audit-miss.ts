/** Round 22/32: audit → AI jump miss — calm info toast; action starts a new chat (no fabricated history). */
export type AuditOpenAiMissToast = {
  messageKey: 'au2.openAiMiss'
  actionKey: 'au2.openAiMissAction'
  kind: 'info'
  theme: 'info'
  ms: number
}

export function buildAuditOpenAiMissToast(): AuditOpenAiMissToast {
  return {
    messageKey: 'au2.openAiMiss',
    actionKey: 'au2.openAiMissAction',
    kind: 'info',
    theme: 'info',
    ms: 7000
  }
}

/** True when any assistant line carries a failed exec pin (for next-confirm accent). */
export function hasFailedExecPin(
  lines: ReadonlyArray<{ role?: string; exec?: { status?: string } | null }>
): boolean {
  return lines.some((l) => l?.role === 'assistant' && l.exec?.status === 'failed')
}
