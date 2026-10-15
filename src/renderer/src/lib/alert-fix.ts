/** W1 / W1b / W1c share this decision. The home inbox must not grow a second draft path. */
import { fixesFor, type RememberedFix } from './ai-fix-memory'

export type AlertFixPlan =
  | { action: 'need-ai' }
  | { action: 'draft'; fixes: RememberedFix[] }
  | { action: 'explain' }
  | { action: 'none' }

export function planAlertFix(
  alertId: string,
  aiConfigured: boolean,
  lookup: (key: string) => RememberedFix[] | undefined = fixesFor
): AlertFixPlan {
  if (!aiConfigured) return { action: 'need-ai' }
  const fixes = lookup(`explainAlert:${alertId}`)
  if (fixes && fixes.length > 0) return { action: 'draft', fixes }
  if (fixes) return { action: 'none' }
  return { action: 'explain' }
}
