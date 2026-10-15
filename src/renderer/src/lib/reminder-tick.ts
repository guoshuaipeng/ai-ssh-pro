/** W6 desktop reminder. Focuses the dry-run control. Never runs a playbook. */
import { loadPlaybooks } from '@shared/playbook'
import { loadReminders, planReminderNotices, saveReminders, type ReminderNotice } from '@shared/playbook-reminder'

export const REMINDER_FOCUS_EVENT = 'aiss-focus-dry'
export const REMINDER_FILTER_EVENT = 'aiss-playbook-filter-due'

export function collectReminderNotice(now = Date.now()): ReminderNotice | null {
  const names: Record<string, string> = {}
  for (const book of loadPlaybooks()) names[book.id] = book.name
  const planned = planReminderNotices(loadReminders(), names, now)
  const notice = planned.notices[0]
  if (!notice) return null
  saveReminders(planned.next)
  return notice
}
