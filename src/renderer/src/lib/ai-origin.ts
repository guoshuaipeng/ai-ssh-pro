/** D16: renderer singletons for AI → command bar → result back. */
import { createOriginSet } from '@shared/ai-fill'

export const aiOrigins = createOriginSet()

/** Session the AI panel is talking about (read at click time by answer code blocks). */
export const aiPanelSession: { current: string | null } = { current: null }
