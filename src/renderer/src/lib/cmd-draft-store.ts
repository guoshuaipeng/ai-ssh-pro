/** D24: shared store for command-bar drafts (one bar instance serves all tabs). D63 seeds it on restore. */
export const cmdDrafts = new Map<string, string>()
